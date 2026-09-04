import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  create,
  remove,
  update,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { writeLastCategory } from '@/lib/last-used';
import { queryKeys } from '@/lib/query-keys';

/**
 * Création, modification et suppression d'une transaction.
 *
 * Chaque mutation invalide la liste récente du groupe : le dashboard se
 * rafraîchit sans qu'un écran ait à propager quoi que ce soit.
 */
export function useTransactionMutations() {
  const queryClient = useQueryClient();
  const { activeGroupId } = useActiveGroup();

  function invalidate() {
    if (activeGroupId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.recentTransactions(activeGroupId),
      });
    }
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
    isPending:
      createTransaction.isPending ||
      updateTransaction.isPending ||
      deleteTransaction.isPending,
  };
}
