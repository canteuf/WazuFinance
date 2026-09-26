import { useQuery } from '@tanstack/react-query';

import { listGroupMembers } from '@/data/groups';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import { departedAuthorName } from '@/lib/members';
import { queryKeys } from '@/lib/query-keys';

export type TransactionAuthor = {
  /** « Vous » pour l'utilisateur courant : dans une liste, son propre prénom se lit moins vite que ce mot. */
  name: string;
  avatar: string | null;
};

/**
 * Qui a saisi une opération, pour l'afficher sur sa ligne dans un budget partagé. `null` dans le compte personnel, où la question ne se pose pas, et pour un membre parti du groupe : `users_select_self_or_covisible` ne montre que les membres actuels.
 *
 * Un compte supprimé, lui, a laissé son nom sur la ligne (`author_name`, `user_id` à NULL) : la ligne le nomme comme ancien membre.
 *
 * Même clé que useGroupMembers(), donc le même cache, mais sans son `refetchOnMount: 'always'` : chaque ligne d'une liste monte ce hook, et chacune rechargerait la liste des membres. useMembershipsRealtime() invalide déjà la clé quand un membre arrive ou part.
 */
export function useTransactionAuthor(
  userId: string | null,
  authorName: string | null
): TransactionAuthor | null {
  const { activeGroup } = useActiveGroup();
  const { session } = useAuth();
  const shared = activeGroup !== null && !activeGroup.isPersonal;
  const groupId = activeGroup?.groupId ?? '';

  const { data } = useQuery({
    queryKey: queryKeys.groupMembers(groupId),
    queryFn: () => listGroupMembers(groupId),
    enabled: shared,
  });

  if (!shared) {
    return null;
  }
  if (userId === null) {
    return { name: departedAuthorName(authorName), avatar: null };
  }
  if (userId === session?.user.id) {
    const self = data?.find((member) => member.userId === userId);
    return { name: 'Vous', avatar: self?.avatar ?? null };
  }
  const member = data?.find((candidate) => candidate.userId === userId);
  return member ? { name: member.displayName, avatar: member.avatar } : null;
}
