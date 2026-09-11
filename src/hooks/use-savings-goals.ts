import { useQuery } from '@tanstack/react-query';

import { listSavingsGoals, type SavingsGoal } from '@/data/savings-goals';
import { queryKeys } from '@/lib/query-keys';

/** Objectifs de l'utilisateur courant. Sans paramètre : voir savings-goals.ts. */
export function useSavingsGoals(): {
  goals: SavingsGoal[];
  isLoading: boolean;
  error: unknown;
  /** Vrai seulement si aucune lecture n'a jamais abouti. */
  isLoadingError: boolean;
} {
  const { data, isLoading, error, isLoadingError } = useQuery({
    queryKey: queryKeys.savingsGoals(),
    queryFn: listSavingsGoals,
  });

  return { goals: data ?? [], isLoading, error, isLoadingError };
}
