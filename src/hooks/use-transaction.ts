import { useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';

import { getById, type TransactionWithCategory } from '@/data/transactions';
import { queryKeys } from '@/lib/query-keys';

type CachedRow = { row: TransactionWithCategory; updatedAt: number };

/**
 * La ligne `id` telle qu'une liste déjà en cache l'a reçue — la liste récente du tableau de bord ou une page de l'historique —, avec l'instant de cette lecture.
 */
function findInLists(queryClient: QueryClient, id: string): CachedRow | undefined {
  const lists = queryClient.getQueryCache().findAll({ queryKey: queryKeys.transactions() });
  for (const query of lists) {
    const data: unknown = query.state.data;
    const rows: unknown[] = Array.isArray(data)
      ? data
      : typeof data === 'object' && data !== null && Array.isArray((data as { pages?: unknown }).pages)
        ? (data as { pages: unknown[][] }).pages.flat()
        : [];
    const row = rows.find(
      (candidate): candidate is TransactionWithCategory =>
        typeof candidate === 'object' &&
        candidate !== null &&
        (candidate as { id?: unknown }).id === id &&
        'updated_at' in candidate &&
        'occurred_on' in candidate
    );
    if (row) {
      return { row, updatedAt: query.state.dataUpdatedAt };
    }
  }
  return undefined;
}

/**
 * Transaction chargée pour le mode édition de la feuille (`?id=`).
 *
 * Séparé de use-transaction-mutations.ts, qui couvre l'écriture : ce hook ne couvre que la lecture, pour pré-remplir le formulaire. `id` reste optionnel pour que l'écran l'appelle sans détour même en mode création, où la requête est simplement désactivée.
 *
 * Pré-remplie depuis la liste d'où l'utilisateur vient : hors ligne, la fiche n'avait jamais été lue et la requête restait en pause, sans donnée ni erreur, et le formulaire s'ouvrait vide sous « Modifier ». Avec la ligne de la liste, il s'ouvre sur les vraies valeurs ; `initialDataUpdatedAt` date cette lecture, et la fiche est relue dès que le réseau le permet.
 */
export function useTransaction(id: string | undefined): UseQueryResult<TransactionWithCategory> {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.transaction(id ?? ''),
    queryFn: () => getById(id as string),
    enabled: typeof id === 'string',
    initialData: () => (typeof id === 'string' ? findInLists(queryClient, id)?.row : undefined),
    initialDataUpdatedAt: () =>
      typeof id === 'string' ? findInLists(queryClient, id)?.updatedAt : undefined,
  });
}
