import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { getById, type TransactionWithCategory } from '@/data/transactions';
import { queryKeys } from '@/lib/query-keys';

/**
 * Transaction chargée pour le mode édition de la feuille (`?id=`).
 *
 * Séparé de use-transaction-mutations.ts, qui couvre l'écriture : ce hook ne
 * couvre que la lecture, pour pré-remplir le formulaire. `id` reste optionnel
 * pour que l'écran l'appelle sans détour même en mode création, où la requête
 * est simplement désactivée.
 */
export function useTransaction(id: string | undefined): UseQueryResult<TransactionWithCategory> {
  return useQuery({
    queryKey: queryKeys.transaction(id ?? ''),
    queryFn: () => getById(id as string),
    enabled: typeof id === 'string',
  });
}
