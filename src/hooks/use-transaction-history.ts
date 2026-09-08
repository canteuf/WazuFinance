import { useInfiniteQuery } from '@tanstack/react-query';

import {
  listPage,
  type TransactionCursor,
  type TransactionFilters,
  type TransactionWithCategory,
} from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';

/** Lignes par page. Assez pour remplir un écran haut sans le charger d'un coup. */
export const HISTORY_PAGE_SIZE = 20;

export function useTransactionHistory(filters: TransactionFilters): {
  transactions: TransactionWithCategory[];
  isLoading: boolean;
  error: unknown;
  /** Vrai quand l'échec porte sur la première page : rien n'est affichable. */
  isEmptyError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  loadMore: () => void;
  retry: () => void;
} {
  const { activeGroupId } = useActiveGroup();

  const query = useInfiniteQuery({
    queryKey: queryKeys.transactionHistory(activeGroupId ?? '', filters),
    queryFn: ({ pageParam }) =>
      listPage(activeGroupId as string, filters, pageParam, HISTORY_PAGE_SIZE),
    initialPageParam: null as TransactionCursor | null,
    getNextPageParam: (lastPage): TransactionCursor | null => {
      // Une page plus courte que demandée est forcément la dernière : inutile
      // d'aller chercher une page vide pour s'en apercevoir.
      if (lastPage.length < HISTORY_PAGE_SIZE) {
        return null;
      }
      const last = lastPage[lastPage.length - 1];
      return { occurredOn: last.occurred_on, id: last.id };
    },
    enabled: activeGroupId !== null,
  });

  const transactions = query.data?.pages.flat() ?? [];

  return {
    transactions,
    isLoading: query.isLoading,
    error: query.error,
    // On distingue les deux échecs par ce qui est déjà affiché plutôt que par
    // un drapeau de TanStack : effacer trente lignes chargées parce que la
    // trente-et-unième n'est pas venue serait une régression.
    isEmptyError: query.isError && transactions.length === 0,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore: () => {
      // Sans ce garde, chaque frôlement du bas relancerait une requête déjà
      // en vol.
      if (query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    },
    retry: () => {
      void query.refetch();
    },
  };
}
