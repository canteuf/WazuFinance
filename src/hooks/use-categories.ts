import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { listForGroup, type Category } from '@/data/categories';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';
import type { TransactionType } from '@/types/database';

/**
 * Catégories du groupe actif, filtrées par type : basculer sur Revenu ne doit
 * pas proposer Loyer.
 */
export function useCategories(type: TransactionType): {
  categories: Category[];
  isLoading: boolean;
  error: unknown;
} {
  const { activeGroupId } = useActiveGroup();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.categories(activeGroupId ?? ''),
    queryFn: () => listForGroup(activeGroupId as string),
    enabled: activeGroupId !== null,
  });

  const categories = useMemo(
    () => (data ?? []).filter((category) => category.type === type),
    [data, type]
  );

  return { categories, isLoading, error };
}
