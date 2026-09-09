import { useQuery } from '@tanstack/react-query';

import { getCategoryBreakdown, type CategorySlice } from '@/data/summary';
import { useActiveGroup } from '@/hooks/use-active-group';
import { periodBounds, todayIso } from '@/lib/dates';
import { queryKeys } from '@/lib/query-keys';

/** Repli quand le groupe actif n'est pas encore résolu : le mois calendaire. */
const DEFAULT_START_DAY = 1;

/**
 * Répartition des dépenses de la période en cours, la plus grosse part
 * d'abord.
 *
 * Mêmes bornes que `usePeriodSummary` : les deux doivent parler de la même
 * période, sans quoi le total affiché et la somme des parts se contrediraient
 * à l'écran.
 */
export function useCategoryBreakdown(): {
  slices: CategorySlice[];
  isLoading: boolean;
  error: unknown;
} {
  const { activeGroupId, activeGroup } = useActiveGroup();
  const { from, to } = periodBounds(
    todayIso(),
    activeGroup?.periodStartDay ?? DEFAULT_START_DAY
  );

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.categoryBreakdown(activeGroupId ?? '', from),
    queryFn: () => getCategoryBreakdown(activeGroupId as string, from, to),
    enabled: activeGroupId !== null,
  });

  return { slices: data ?? [], isLoading, error };
}
