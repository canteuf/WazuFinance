import { onlineManager, useMutationState } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import type { CreateTransactionInput, TransactionWithCategory } from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useCategories } from '@/hooks/use-categories';
import { mutationKeys } from '@/lib/query-keys';

/**
 * Vrai quand l'appareil a du réseau, d'après l'`onlineManager` de TanStack Query — le même signal qui met les requêtes et les écritures en pause. L'écran et le cache ne peuvent donc pas se contredire sur l'état de la connexion.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true
  );
}

/**
 * Nombre d'écritures sur les opérations pas encore acceptées par la base : en file sans réseau, ou en cours d'envoi à son retour.
 */
export function usePendingWrites(): number {
  return useMutationState({
    filters: { mutationKey: mutationKeys.transactionWrites(), status: 'pending' },
    select: (mutation) => mutation.mutationId,
  }).length;
}

/**
 * Saisies du groupe actif faites hors ligne et pas encore envoyées, sous la forme des lignes que lisent les listes, les plus récentes d'abord.
 *
 * Elles ne sont pas insérées dans le cache des listes ni dans les totaux : le solde, la répartition et les budgets sont calculés par Postgres, et les recalculer ici pour quelques minutes ferait une seconde définition de « dépense de la période » à tenir d'accord avec la première. Elles s'affichent donc à part, marquées comme telles, et rejoignent les chiffres à leur envoi.
 */
export function usePendingTransactions(): TransactionWithCategory[] {
  const { activeGroupId } = useActiveGroup();
  const { categories } = useCategories(null);

  const pending = useMutationState({
    filters: { mutationKey: mutationKeys.createTransaction(), status: 'pending' },
    select: (mutation) => ({
      mutationId: mutation.mutationId,
      submittedAt: mutation.state.submittedAt,
      input: mutation.state.variables as CreateTransactionInput | undefined,
    }),
  });

  return pending
    .filter((entry) => entry.input !== undefined && entry.input.groupId === activeGroupId)
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .map(({ mutationId, submittedAt, input }) => {
      const values = input as CreateTransactionInput;
      const category = categories.find((candidate) => candidate.id === values.categoryId);
      const stamp = new Date(submittedAt).toISOString();
      return {
        id: `pending-${mutationId}`,
        group_id: values.groupId,
        user_id: values.userId,
        category_id: values.categoryId,
        savings_goal_id: null,
        is_savings: false,
        debt_id: null,
        wallet_id: values.walletId ?? null,
        type: values.type,
        amount: values.amount,
        occurred_on: values.occurredOn,
        note: values.note,
        created_at: stamp,
        updated_at: stamp,
        category: category ? { id: category.id, name: category.name, icon: category.icon } : null,
      };
    });
}
