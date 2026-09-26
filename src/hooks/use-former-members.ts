import { useQuery } from '@tanstack/react-query';

import { listFormerMembers, type FormerMember } from '@/data/groups';
import { queryKeys } from '@/lib/query-keys';

/**
 * Membres partis du groupe, avec le nom qu'ils avaient en partant. Désactivé pour un compte personnel (`enabled`), où personne ne part.
 *
 * Pas de `refetchOnMount: 'always'` : chaque ligne d'une liste monte ce hook, comme useTransactionAuthor(), et useMembershipsRealtime() invalide déjà la clé à chaque départ.
 */
export function useFormerMembers(groupId: string, enabled: boolean): FormerMember[] {
  const { data } = useQuery({
    queryKey: queryKeys.formerMembers(groupId),
    queryFn: () => listFormerMembers(groupId),
    enabled: enabled && groupId !== '',
  });
  return data ?? [];
}
