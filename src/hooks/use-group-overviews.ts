import { useQuery } from '@tanstack/react-query';

import { getGroupOverviews } from '@/data/groups';
import { queryKeys } from '@/lib/query-keys';

/**
 * Chiffres de l'écran « Mes groupes ».
 *
 * Rechargés à chaque ouverture : un plafond modifié ne passe pas par l'invalidation des adhésions, et un membre a pu rejoindre ou partir depuis un autre appareil.
 */
export function useGroupOverviews() {
  const query = useQuery({
    queryKey: queryKeys.groupOverviews(),
    queryFn: getGroupOverviews,
    refetchOnMount: 'always',
  });

  return {
    overviews: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
