import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createInvitation,
  getActiveInvitation,
  revokeInvitation,
  type InvitationRole,
} from '@/data/groups';
import { queryKeys } from '@/lib/query-keys';

/**
 * Invitation active d'un groupe (au plus une à la fois, spec section 1) et ses mutations. Désactivé tant que groupId est vide.
 */
export function useGroupInvitation(groupId: string, createdBy: string | undefined) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.groupInvitation(groupId),
    queryFn: () => getActiveInvitation(groupId),
    enabled: groupId !== '',
    // group_invitations n'est pas dans la publication Realtime : sans ça, une régénération faite ailleurs ne se voit qu'après le staleTime.
    refetchOnMount: 'always',
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.groupInvitation(groupId) });
  }

  const generate = useMutation({
    mutationFn: (role: InvitationRole) => createInvitation(groupId, createdBy as string, role),
    onSuccess: invalidate,
  });

  // Régénérer révoque l'invitation active avant d'en créer une nouvelle : deux appels séparés. Si le second échoue après que le premier a réussi, le code révoqué resterait affiché comme actif sans onSettled — invalider ici même en cas d'échec partiel, contrairement à generate ci-dessus qui n'a pas cet état intermédiaire. Changer le rôle des invités passe aussi par là : un code porte son rôle, un autre rôle est un autre code.
  const regenerate = useMutation({
    mutationFn: async ({ activeInvitationId, role }: { activeInvitationId: string; role: InvitationRole }) => {
      await revokeInvitation(activeInvitationId);
      return createInvitation(groupId, createdBy as string, role);
    },
    onSettled: invalidate,
  });

  return {
    invitation: data ?? null,
    isLoading,
    error,
    generate,
    regenerate,
    isGenerating: generate.isPending || regenerate.isPending,
  };
}
