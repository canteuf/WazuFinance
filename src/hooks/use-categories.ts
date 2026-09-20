import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { listForGroup, type Category } from '@/data/categories';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';
import type { TransactionType } from '@/types/database';

/**
 * Catégories du groupe actif, filtrées par type : basculer sur Revenu ne doit pas proposer Loyer. `null` les rend toutes, pour le filtre « Tout » de l'historique.
 */
export function useCategories(type: TransactionType | null): {
  categories: Category[];
  isLoading: boolean;
  error: unknown;
  retry: () => void;
} {
  const { activeGroupId } = useActiveGroup();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.categories(activeGroupId ?? ''),
    queryFn: () => listForGroup(activeGroupId as string),
    enabled: activeGroupId !== null,
  });

  const categories = useMemo(
    () => (data ?? []).filter((category) => type === null || category.type === type),
    [data, type]
  );

  return {
    categories,
    isLoading,
    error,
    retry: () => {
      void refetch();
    },
  };
}
