import { useQuery } from '@tanstack/react-query';

import { getTotals, type BudgetTotals } from '@/data/budgets';
import { useActiveGroup } from '@/hooks/use-active-group';
import { periodBounds, todayIso } from '@/lib/dates';
import { queryKeys } from '@/lib/query-keys';

/**
 * Totaux des enveloppes du groupe actif sur la période en cours.
 *
 * Mêmes bornes que useCategoryBreakdown, que les cartes lisent : le total en tête et les montants des cartes décrivent la même période.
 */
export function useBudgetTotals(): { totals: BudgetTotals | undefined } {
  const { activeGroupId, activeGroup } = useActiveGroup();
  const { from, to } = periodBounds(todayIso(), activeGroup?.periodStartDay ?? 1);

  const { data } = useQuery({
    queryKey: queryKeys.budgetTotals(activeGroupId ?? '', from),
    queryFn: () => getTotals(activeGroupId as string, from, to),
    enabled: activeGroupId !== null,
  });

  // Même parti que useSavingsOverview : sans totaux, la carte de synthèse s'efface et les enveloppes restent lisibles.
  return { totals: data };
}
