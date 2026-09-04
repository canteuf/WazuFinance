import { useQuery } from '@tanstack/react-query';

import { listRecent, type TransactionWithCategory } from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';

/** Nombre de lignes affichées sur le dashboard. L'historique complet est l'écran 3. */
export const RECENT_LIMIT = 5;

export function useRecentTransactions(): {
  transactions: TransactionWithCategory[];
  isLoading: boolean;
  error: unknown;
} {
  const { activeGroupId } = useActiveGroup();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.recentTransactions(activeGroupId ?? ''),
    queryFn: () => listRecent(activeGroupId as string, RECENT_LIMIT),
    enabled: activeGroupId !== null,
  });

  return { transactions: data ?? [], isLoading, error };
}
