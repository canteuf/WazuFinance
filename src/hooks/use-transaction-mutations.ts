import { useMutation, type QueryClient } from '@tanstack/react-query';

import {
  create,
  remove,
  update,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from '@/data/transactions';
import { writeLastCategory } from '@/lib/last-used';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import type { Tables } from '@/types/database';

type UpdateVariables = { id: string; patch: UpdateTransactionInput };

/**
 * Fonctions et effets des trois écritures, enregistrés une fois sur le QueryClient à sa création (query-provider) plutôt que passés à `useMutation`.
 *
 * C'est la condition du mode hors ligne : une saisie faite sans réseau reste en file, est écrite sur le disque avec le cache, et peut être rejouée après un redémarrage de l'app — à ce moment aucun écran ne l'a appelée, et seule sa clé permet au client de retrouver la fonction à exécuter. Les effets (invalidation, dernière catégorie) sont ici pour la même raison : une saisie rejouée au démarrage doit rafraîchir le tableau de bord comme une saisie faite en ligne.
 *
 * `networkMode: 'online'` : sans réseau, la mutation se met en pause au lieu d'échouer. Les autres écritures de l'app restent en `'always'` (défaut du provider) et échouent aussitôt avec « Pas de connexion » — elles n'ont pas de valeurs par défaut enregistrées et ne pourraient pas être rejouées après un redémarrage.
 *
 * Chaque mutation invalide le préfixe ['transactions'] : ça touche à la fois la liste récente et les détails en cache (queryKeys.transaction), et ça ne dépend pas du groupe actif au moment où la réponse arrive — le mutate() peut avoir été déclenché sous un autre groupe entre-temps, ou la veille pour une saisie rejouée.
 */
export function registerTransactionMutationDefaults(queryClient: QueryClient): void {
  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
  }

  queryClient.setMutationDefaults(mutationKeys.createTransaction(), {
    mutationFn: (input: CreateTransactionInput) => create(input),
    networkMode: 'online',
    onSuccess: async (_data: unknown, input: CreateTransactionInput) => {
      // La préférence n'est mémorisée qu'une fois la ligne acceptée par la base : une saisie refusée ne doit pas changer le défaut.
      await writeLastCategory(input.groupId, input.categoryId);
      void invalidate();
    },
  });

  queryClient.setMutationDefaults(mutationKeys.updateTransaction(), {
    mutationFn: ({ id, patch }: UpdateVariables) => update(id, patch),
    networkMode: 'online',
    onSuccess: () => void invalidate(),
  });

  queryClient.setMutationDefaults(mutationKeys.deleteTransaction(), {
    mutationFn: (id: string) => remove(id),
    networkMode: 'online',
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
  };
}
