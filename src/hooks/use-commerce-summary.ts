import { useQuery } from '@tanstack/react-query';

import { getCommerceSummary, type CommerceSummary } from '@/data/summary';
import { useActiveGroup } from '@/hooks/use-active-group';
import { periodBounds, todayIso } from '@/lib/dates';
import { queryKeys } from '@/lib/query-keys';

/**
 * Ventes et achats de stock de la période en cours, sur les bornes de `periodBounds()` comme le reste de la Synthèse.
 */
export function useCommerceSummary(): CommerceSummary | undefined {
  const { activeGroupId, activeGroup } = useActiveGroup();
  const { from, to } = periodBounds(todayIso(), activeGroup?.periodStartDay ?? 1);

  const query = useQuery({
    queryKey: queryKeys.commerceSummary(activeGroupId ?? '', from),
    queryFn: () => getCommerceSummary(activeGroupId as string, from, to),
    enabled: activeGroupId !== null,
  });

  return query.data;
}
