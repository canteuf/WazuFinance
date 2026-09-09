import { useQuery } from '@tanstack/react-query';

import { listRecent, type TransactionWithCategory } from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { periodBounds, todayIso } from '@/lib/dates';
import { queryKeys } from '@/lib/query-keys';

/** Nombre de lignes affichées sur le dashboard. L'historique complet est l'écran 3. */
export const RECENT_LIMIT = 5;

/** Repli quand le groupe actif n'est pas encore résolu : le mois calendaire. */
const DEFAULT_START_DAY = 1;

/**
 * Dernières opérations de la période en cours pour le groupe actif.
 *
 * Mêmes bornes que `usePeriodSummary` et `useCategoryBreakdown` : les quatre
 * blocs du tableau de bord décrivent la même période. Sans cette borne, une
 * opération de la période précédente apparaissait sous un solde qui ne la
 * comptait pas, puis disparaissait au passage à l'historique — qui s'ouvre,
 * lui, sur la période en cours.
 */
export function useRecentTransactions(): {
  transactions: TransactionWithCategory[];
  isLoading: boolean;
  error: unknown;
} {
  const { activeGroupId, activeGroup } = useActiveGroup();
  const { from, to } = periodBounds(
    todayIso(),
    activeGroup?.periodStartDay ?? DEFAULT_START_DAY
  );

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.recentTransactions(activeGroupId ?? '', from),
    queryFn: () => listRecent(activeGroupId as string, RECENT_LIMIT, from, to),
    enabled: activeGroupId !== null,
  });

  return { transactions: data ?? [], isLoading, error };
}
