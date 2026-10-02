import { useMutation, type QueryClient } from '@tanstack/react-query';

import { recordDebtPayment, type RecordDebtPaymentInput } from '@/data/debts';
import { createRecurring } from '@/data/recurring';
import {
  create,
  remove,
  update,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from '@/data/transactions';
import { isTransportError, RECURRENCE_FAILED } from '@/lib/data-errors';
import { writeLastCategory, writeLastType, writeLastWallet } from '@/lib/last-used';
import { isRetryingWrite, mergeSavedRow, transportRetryDelay, VersionChain } from '@/lib/offline-queue';
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

/** La catégorie `id` telle que la grille l'a lue, dans la forme que les listes joignent à une opération ; `null` si aucune liste de catégories en cache ne la connaît. */
function findCachedCategory(
  queryClient: QueryClient,
  id: string | null
): { id: string; name: string; icon: string } | null {
  if (id === null) {
    return null;
  }
  for (const [, data] of queryClient.getQueriesData<unknown>({ queryKey: ['categories'] })) {
    if (!Array.isArray(data)) {
      continue;
    }
    const found = data.find(
      (item): item is { id: string; name: string; icon: string } =>
        typeof item === 'object' && item !== null && (item as { id?: unknown }).id === id
    );
    if (found) {
      return { id: found.id, name: found.name, icon: found.icon };
    }
  }
  return null;
}

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
    // L'opération, puis sa récurrence s'il y en a une : dans la même fonction, pour qu'un renvoi après une panne de réseau reprenne les deux. Chacune porte un id tiré par l'app, donc un renvoi ne double ni l'une ni l'autre. Un refus de la récurrence seule ne doit pas se lire comme une opération perdue : il est levé sous RECURRENCE_FAILED, que data-errors traduit.
    mutationFn: async (input: CreateTransactionInput) => {
      const row = await create(input);
      if (input.recurrence) {
        try {
          await createRecurring(input.recurrence);
        } catch (error) {
          if (isTransportError(error)) {
            throw error;
          }
          throw Object.assign(new Error('Répétition refusée'), { code: RECURRENCE_FAILED, cause: error });
        }
      }
      return row;
    },
    // Les préférences sont retenues dès la saisie, même mise en file sans réseau : attendre la réponse de la base laissait, un matin hors ligne, la présélection de la veille à chaque nouvelle vente. Une saisie refusée ensuite ne change qu'un défaut, que l'utilisateur corrige d'un toucher.
    onMutate: async (input: CreateTransactionInput) => {
      await Promise.all([
        writeLastType(input.groupId, input.type),
        writeLastCategory(input.groupId, input.categoryId),
        input.walletId ? writeLastWallet(input.groupId, input.walletId) : Promise.resolve(),
      ]);
    },
    onSuccess: (_data: unknown, input: CreateTransactionInput) => {
      void invalidate();
      if (input.recurrence) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.recurringAll() });
      }
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
    // La ligne enregistrée est reportée tout de suite dans les listes et la fiche (mergeSavedRow), puis le cache est invalidé comme avant. Si le réseau tombe avant le rechargement, le cache — et le disque — restent sur la bonne version, et la correction suivante ne bute pas sur un faux conflit.
    onSuccess: (saved: Tables<'transactions'>) => {
      const category = findCachedCategory(queryClient, saved.category_id);
      queryClient.setQueriesData<unknown>({ queryKey: queryKeys.transactions() }, (data: unknown) =>
        mergeSavedRow(data, saved, category)
      );
      void invalidate();
    },
  });

  queryClient.setMutationDefaults(mutationKeys.deleteTransaction(), {
    ...common,
    mutationFn: (id: string) => remove(id),
    onSuccess: () => void invalidate(),
  });

  // Le remboursement d'une dette patiente lui aussi : la commerçante encaisse son client au marché, souvent sans réseau. Rejouable sans doublon (l'id du mouvement vient de l'app), et un remboursement devenu trop grand entre-temps — un autre membre a soldé la dette — est refusé par la base, jamais renvoyé, et signalé par l'alerte des écritures en file.
  queryClient.setMutationDefaults(mutationKeys.recordDebtPayment(), {
    ...common,
    mutationFn: (input: RecordDebtPaymentInput) => recordDebtPayment(input),
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
      isRetryingWrite(createTransaction) ||
      isRetryingWrite(updateTransaction) ||
      isRetryingWrite(deleteTransaction),
  };
}
