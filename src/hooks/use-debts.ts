import { useQuery } from '@tanstack/react-query';

import { getDebtTotals, listDebts, type DebtOverview, type DebtTotals } from '@/data/debts';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';

/** Prêts et dettes du groupe actif, avec leur reste dû. */
export function useDebts(): { debts: DebtOverview[]; isLoading: boolean; error: unknown } {
  const { activeGroupId } = useActiveGroup();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.debts(activeGroupId ?? ''),
    queryFn: () => listDebts(activeGroupId as string),
    enabled: activeGroupId !== null,
  });

  return { debts: data ?? [], isLoading, error };
}

/** Ce qu'on doit au groupe actif et ce qu'il doit, sommés en base. */
export function useDebtTotals(): { totals: DebtTotals | undefined; isLoading: boolean } {
  const { activeGroupId } = useActiveGroup();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.debtTotals(activeGroupId ?? ''),
    queryFn: () => getDebtTotals(activeGroupId as string),
    enabled: activeGroupId !== null,
  });

  return { totals: data, isLoading };
}
