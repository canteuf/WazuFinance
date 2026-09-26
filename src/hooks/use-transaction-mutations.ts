import { useMutation, type QueryClient } from '@tanstack/react-query';

import {
  create,
  remove,
  update,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from '@/data/transactions';
import { isTransportError } from '@/lib/data-errors';
import { writeLastCategory, writeLastWallet } from '@/lib/last-used';
import { transportRetryDelay, VersionChain } from '@/lib/offline-queue';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import type { Tables } from '@/types/database';

export type UpdateVariables = {
  id: string;
  patch: UpdateTransactionInput;
  /**
   * `updated_at` de la ligne lue à l'ouverture du formulaire : la base refuse la modification si elle a changé depuis (voir `update`). Absent d'une modification mise en file par une version antérieure de l'app.
   */
  expectedUpdatedAt?: string;
};

/**
 * Versions que les modifications de cette session ont elles-mêmes produites (voir `VersionChain`). En mémoire seulement : après un redémarrage, la file relue du disque est rejouée dans l'ordre pendant la même session, et la chaîne se reconstruit au fil des envois ; une modification déjà passée avant le redémarrage est reconnue par `update` à ses valeurs.
 */
const ownVersions = new VersionChain();

/**
 * Fonctions et effets des trois écritures, enregistrés une fois sur le QueryClient à sa création (query-provider) plutôt que passés à `useMutation`.
 *
 * C'est la condition du mode hors ligne : une saisie faite sans réseau reste en file, est écrite sur le disque avec le cache, et peut être rejouée après un redémarrage de l'app — à ce moment aucun écran ne l'a appelée, et seule sa clé permet au client de retrouver la fonction à exécuter. Les effets (invalidation, dernière catégorie) sont ici pour la même raison : une saisie rejouée au démarrage doit rafraîchir le tableau de bord comme une saisie faite en ligne.
 *
 * `networkMode: 'online'` : sans réseau, la mutation se met en pause au lieu d'échouer. Les autres écritures de l'app restent en `'always'` (défaut du provider) et échouent aussitôt avec « Pas de connexion » — elles n'ont pas de valeurs par défaut enregistrées et ne pourraient pas être rejouées après un redémarrage.
 *
 * `retry` : une panne de transport est renvoyée sans limite, avec un délai croissant, parce que la saisie ne doit jamais quitter la file faute de réseau ; elle reste « en attente » et sur le disque tant qu'elle n'est pas passée. Un refus de la base, lui, n'est jamais renvoyé : il ne changerait pas au second essai.
 *
 * `scope` : les trois écritures partent une par une, dans l'ordre où elles ont été faites. Sans cela, la file relue au démarrage partait d'un bloc, et deux modifications de la même opération pouvaient arriver dans le désordre.
 *
 * Chaque mutation invalide le préfixe ['transactions'] : ça touche à la fois la liste récente et les détails en cache (queryKeys.transaction), et ça ne dépend pas du groupe actif au moment où la réponse arrive — le mutate() peut avoir été déclenché sous un autre groupe entre-temps, ou la veille pour une saisie rejouée.
 */
export function registerTransactionMutationDefaults(queryClient: QueryClient): void {
  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
  }

  const common = {
    networkMode: 'online',
    scope: { id: 'transaction-writes' },
    retry: (_failureCount: number, error: unknown) => isTransportError(error),
    retryDelay: transportRetryDelay,
  } as const;

  queryClient.setMutationDefaults(mutationKeys.createTransaction(), {
    ...common,
    mutationFn: (input: CreateTransactionInput) => create(input),
    onSuccess: async (_data: unknown, input: CreateTransactionInput) => {
      // La préférence n'est mémorisée qu'une fois la ligne acceptée par la base : une saisie refusée ne doit pas changer le défaut.
      await writeLastCategory(input.groupId, input.categoryId);
      if (input.walletId) {
        await writeLastWallet(input.groupId, input.walletId);
      }
      void invalidate();
    },
  });

  queryClient.setMutationDefaults(mutationKeys.updateTransaction(), {
    ...common,
    mutationFn: async ({ id, patch, expectedUpdatedAt }: UpdateVariables) => {
      const expected = ownVersions.resolve(id, expectedUpdatedAt);
      const saved = await update(id, patch, expected);
      if (expected !== undefined) {
        ownVersions.record(id, expected, saved.updated_at);
      }
      return saved;
    },
    onSuccess: () => void invalidate(),
  });

  queryClient.setMutationDefaults(mutationKeys.deleteTransaction(), {
    ...common,
    mutationFn: (id: string) => remove(id),
    onSuccess: () => void invalidate(),
  });
}

/**
 * Création, modification et suppression d'une transaction. Le comportement vit dans `registerTransactionMutationDefaults` ; ce hook ne fait que s'y brancher par clé.
 */
export function useTransactionMutations() {
  const createTransaction = useMutation<Tables<'transactions'>, Error, CreateTransactionInput>({
    mutationKey: mutationKeys.createTransaction(),
  });

  const updateTransaction = useMutation<Tables<'transactions'>, Error, UpdateVariables>({
    mutationKey: mutationKeys.updateTransaction(),
  });

  const deleteTransaction = useMutation<void, Error, string>({
    mutationKey: mutationKeys.deleteTransaction(),
  });

  return {
    createTransaction,
    updateTransaction,
    deleteTransaction,
    // Deux indicateurs distincts plutôt qu'un seul agrégé : un indicateur unique faisait tourner le bouton Supprimer pendant l'enregistrement, et inversement, chaque bouton reflétant l'état de l'autre.
    isSaving: createTransaction.isPending || updateTransaction.isPending,
    isDeleting: deleteTransaction.isPending,
    /** Vrai dès qu'une écriture en cours a buté sur le réseau : elle est en file et sera renvoyée seule, la feuille n'a plus à l'attendre. */
    isRetrying:
      createTransaction.failureCount > 0 ||
      updateTransaction.failureCount > 0 ||
      deleteTransaction.failureCount > 0,
  };
}
