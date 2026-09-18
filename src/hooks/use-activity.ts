import { useInfiniteQuery } from '@tanstack/react-query';

import { listActivityPage, type ActivityCursor, type ActivityEntry } from '@/data/activity';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';

/** Entrées par page : une entrée tient sur deux ou trois lignes. */
export const ACTIVITY_PAGE_SIZE = 30;

/**
 * Journal du groupe actif.
 *
 * Pas de temps réel : une liste qui bouge sous le doigt pendant qu'on la lit est pire qu'une liste rechargée à l'ouverture. `refetchOnMount: 'always'` passe outre le `staleTime` global de 30 s, pour que chaque ouverture de l'écran montre l'état du moment.
 */
export function useActivity(): {
  entries: ActivityEntry[];
  isLoading: boolean;
  error: unknown;
  /** Vrai quand l'échec porte sur la première page : rien n'est affichable. */
  isEmptyError: boolean;
  isFetchingNextPage: boolean;
  loadMore: () => void;
  retry: () => void;
  refresh: () => Promise<void>;
} {
  const { activeGroupId } = useActiveGroup();

  const query = useInfiniteQuery({
    queryKey: queryKeys.activity(activeGroupId ?? ''),
    queryFn: ({ pageParam }) =>
      listActivityPage(activeGroupId as string, pageParam, ACTIVITY_PAGE_SIZE),
    initialPageParam: null as ActivityCursor | null,
    getNextPageParam: (lastPage): ActivityCursor | null => {
      // Une page plus courte que demandée est forcément la dernière.
      if (lastPage.length < ACTIVITY_PAGE_SIZE) {
        return null;
      }
      const last = lastPage[lastPage.length - 1];
      return { occurredAt: last.occurred_at, id: last.id };
    },
    enabled: activeGroupId !== null,
    refetchOnMount: 'always',
  });

  return {
    entries: query.data?.pages.flat() ?? [],
    isLoading: query.isLoading,
    error: query.error,
    // Même raisonnement que use-transaction-history.ts : seul l'échec du premier chargement vide l'écran.
    isEmptyError: query.isLoadingError,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    },
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}
