import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createSharedGroup,
  joinGroupWithCode,
  removeMember,
  setMemberRole,
  transferOwnership,
  updatePeriodStartDay,
  type InvitationRole,
} from '@/data/groups';
import { queryKeys } from '@/lib/query-keys';

/**
 * Création, adhésion et retrait d'un groupe.
 *
 * Chaque mutation invalide `queryKeys.memberships()` : le groupe actif ou la liste des groupes a pu changer (nouveau groupe créé, groupe rejoint, membre — soi-même ou un autre — retiré).
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

  // Rôle ou propriétaire changé : la liste des membres montre les rôles, et les adhésions portent celui de l'appelant (useCanWrite), qui change lors d'une passation.
  function invalidateGroup(groupId: string) {
    invalidateMemberships();
    void queryClient.invalidateQueries({ queryKey: queryKeys.groupMembers(groupId) });
  }

  const setRole = useMutation({
    mutationFn: ({ groupId, userId, role }: { groupId: string; userId: string; role: InvitationRole }) =>
      setMemberRole(groupId, userId, role),
    onSuccess: (_data, variables) => invalidateGroup(variables.groupId),
  });

  const handOver = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      transferOwnership(groupId, userId),
    onSuccess: (_data, variables) => invalidateGroup(variables.groupId),
  });

  // Invalider les adhésions suffit : periodStartDay y est lu, et les clés du tableau de bord dérivent leurs bornes de cette valeur — changer le jour ouvre des entrées de cache neuves, sans rien d'autre à invalider. Les autres membres le reçoivent par useMembershipsRealtime(), budget_groups étant dans la publication.
  const updatePeriodStart = useMutation({
    mutationFn: ({ groupId, day }: { groupId: string; day: number }) =>
      updatePeriodStartDay(groupId, day),
    onSuccess: invalidateMemberships,
  });

  return {
    createGroup,
    joinGroup,
    removeGroupMember,
    updatePeriodStart,
    setRole,
    handOver,
    isChangingRole: setRole.isPending || handOver.isPending,
    isCreating: createGroup.isPending,
    isJoining: joinGroup.isPending,
    isRemoving: removeGroupMember.isPending,
    isUpdatingPeriod: updatePeriodStart.isPending,
  };
}
