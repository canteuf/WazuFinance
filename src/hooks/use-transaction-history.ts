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
    // `isError` seul ne distingue pas le premier chargement en échec
    // d'un refetch en arrière-plan qui échoue après un filtre légitimement
    // vide (zéro résultat n'est pas une erreur) : dans ce second cas,
    // `transactions.length === 0` aussi vaudrait vrai et ferait passer
    // l'écran en erreur plein cadre, emportant la barre de filtres avec elle.
    // `isLoadingError` ne vaut vrai que si aucune page n'a jamais abouti.
    isEmptyError: query.isLoadingError,
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
