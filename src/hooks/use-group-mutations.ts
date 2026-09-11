import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createSharedGroup, joinGroupWithCode, removeMember } from '@/data/groups';
import { queryKeys } from '@/lib/query-keys';

/**
 * Création, adhésion et retrait d'un groupe.
 *
 * Chaque mutation invalide `queryKeys.memberships()` : le groupe actif ou la
 * liste des groupes a pu changer (nouveau groupe créé, groupe rejoint,
 * membre — soi-même ou un autre — retiré).
 */
export function useGroupMutations() {
  const queryClient = useQueryClient();

  function invalidateMemberships() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.memberships() });
  }

  const createGroup = useMutation({
    mutationFn: (name: string) => createSharedGroup(name),
    onSuccess: invalidateMemberships,
  });

  const joinGroup = useMutation({
    mutationFn: (code: string) => joinGroupWithCode(code),
    onSuccess: invalidateMemberships,
  });

  const removeGroupMember = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      removeMember(groupId, userId),
    onSuccess: (_data, variables) => {
      invalidateMemberships();
      void queryClient.invalidateQueries({
        queryKey: queryKeys.groupMembers(variables.groupId),
      });
    },
  });

  return {
    createGroup,
    joinGroup,
    removeGroupMember,
    isCreating: createGroup.isPending,
    isJoining: joinGroup.isPending,
    isRemoving: removeGroupMember.isPending,
  };
}
