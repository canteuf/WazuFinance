import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createSharedGroup,
  joinGroupWithCode,
  removeMember,
  updatePeriodStartDay,
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

  // Invalider les adhésions suffit : periodStartDay y est lu, et les clés du tableau de bord dérivent leurs bornes de cette valeur — changer le jour ouvre des entrées de cache neuves, sans rien d'autre à invalider. Les autres membres d'un groupe partagé voient le nouveau jour au prochain rechargement de leurs adhésions, budget_groups n'étant pas dans la publication Realtime ; acceptable pour un réglage aussi rare.
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
    isCreating: createGroup.isPending,
    isJoining: joinGroup.isPending,
    isRemoving: removeGroupMember.isPending,
    isUpdatingPeriod: updatePeriodStart.isPending,
  };
}
