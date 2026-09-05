import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  create,
  remove,
  update,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from '@/data/transactions';
import { writeLastCategory } from '@/lib/last-used';
import { queryKeys } from '@/lib/query-keys';

/**
 * Création, modification et suppression d'une transaction.
 *
 * Chaque mutation invalide le préfixe ['transactions'] : ça touche à la fois
 * la liste récente et les détails en cache (queryKeys.transaction), et ça ne
 * dépend pas du groupe actif au moment où la réponse arrive — le mutate()
 * peut avoir été déclenché sous un autre groupe entre-temps.
 */
export function useTransactionMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.transactions(),
    });
  }

  const createTransaction = useMutation({
    mutationFn: (input: CreateTransactionInput) => create(input),
    onSuccess: async (_data, input) => {
      // La préférence n'est mémorisée qu'une fois la ligne acceptée par la
      // base : une saisie refusée ne doit pas changer le défaut.
      await writeLastCategory(input.groupId, input.categoryId);
      invalidate();
    },
  });

  const updateTransaction = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTransactionInput }) =>
      update(id, patch),
    onSuccess: invalidate,
  });

  const deleteTransaction = useMutation({
    mutationFn: (id: string) => remove(id),
    onSuccess: invalidate,
  });

  return {
    createTransaction,
    updateTransaction,
    deleteTransaction,
    // Deux indicateurs distincts plutôt qu'un seul agrégé : un indicateur
    // unique faisait tourner le bouton Supprimer pendant l'enregistrement, et
    // inversement, chaque bouton reflétant l'état de l'autre.
    isSaving: createTransaction.isPending || updateTransaction.isPending,
    isDeleting: deleteTransaction.isPending,
  };
}
