import { useQuery } from '@tanstack/react-query';

import { getDailyTotals, type TransactionFilters } from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';

/**
 * Totaux par jour pour les filtres de l'historique.
 *
 * Mêmes filtres que useTransactionHistory, passés tels quels : les en-têtes de jour et la liste doivent décrire les mêmes lignes. Un échec n'est pas bloquant — l'écran affiche alors les jours sans leur total.
 */
export function useDailyTotals(filters: TransactionFilters) {
  const { activeGroupId } = useActiveGroup();

  const query = useQuery({
    queryKey: queryKeys.dailyTotals(activeGroupId ?? '', filters),
    queryFn: () => getDailyTotals(activeGroupId as string, filters),
    enabled: activeGroupId !== null,
  });

  return { totals: query.data };
}
