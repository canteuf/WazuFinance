import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createInvitation, getActiveInvitation, revokeInvitation } from '@/data/groups';
import { queryKeys } from '@/lib/query-keys';

/**
 * Invitation active d'un groupe (au plus une à la fois, spec section 1) et
 * ses mutations. Désactivé tant que groupId est vide.
 */
export function useGroupInvitation(groupId: string, createdBy: string | undefined) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.groupInvitation(groupId),
    queryFn: () => getActiveInvitation(groupId),
    enabled: groupId !== '',
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.groupInvitation(groupId) });
  }

  const generate = useMutation({
    mutationFn: () => createInvitation(groupId, createdBy as string),
    onSuccess: invalidate,
  });

  // Régénérer révoque l'invitation active avant d'en créer une nouvelle.
  const regenerate = useMutation({
    mutationFn: async (activeInvitationId: string) => {
      await revokeInvitation(activeInvitationId);
      return createInvitation(groupId, createdBy as string);
    },
    onSuccess: invalidate,
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
