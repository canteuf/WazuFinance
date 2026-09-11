import { useQuery } from '@tanstack/react-query';

import { listGroupMembers } from '@/data/groups';
import { queryKeys } from '@/lib/query-keys';

/** Membres d'un groupe, avec leur rôle. Désactivé tant que groupId est vide. */
export function useGroupMembers(groupId: string) {
  const { data, isLoading, error, isLoadingError } = useQuery({
    queryKey: queryKeys.groupMembers(groupId),
    queryFn: () => listGroupMembers(groupId),
    enabled: groupId !== '',
  });

  return { members: data ?? [], isLoading, error, isLoadingError };
}
