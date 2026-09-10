import { useQuery } from '@tanstack/react-query';

import { listForGroup, type BudgetWithCategory } from '@/data/budgets';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';

/** Plafonds définis dans le groupe actif. Sans bornes de date : un plafond ne dépend pas de la période. */
export function useBudgets(): {
  budgets: BudgetWithCategory[];
  isLoading: boolean;
  error: unknown;
  /** Vrai seulement si aucune lecture n'a jamais abouti (voir `isLoadingError` de TanStack). */
  isLoadingError: boolean;
} {
  const { activeGroupId } = useActiveGroup();

  const { data, isLoading, error, isLoadingError } = useQuery({
    queryKey: queryKeys.budgets(activeGroupId ?? ''),
    queryFn: () => listForGroup(activeGroupId as string),
    enabled: activeGroupId !== null,
  });

  return { budgets: data ?? [], isLoading, error, isLoadingError };
}
