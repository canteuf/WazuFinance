import { useQuery } from '@tanstack/react-query';

import { listDeletionBlockers } from '@/data/account';
import { queryKeys } from '@/lib/query-keys';

/**
 * Groupes qui empêchent la suppression du compte.
 *
 * Rechargée à chaque ouverture : un membre a pu partir ou être exclu depuis un autre appareil, et une liste périmée désactiverait le bouton à tort — ou l'activerait, et la base refuserait alors avec son propre message.
 */
export function useDeletionBlockers() {
  const query = useQuery({
    queryKey: queryKeys.deletionBlockers(),
    queryFn: listDeletionBlockers,
    refetchOnMount: 'always',
  });

  return {
    blockers: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
