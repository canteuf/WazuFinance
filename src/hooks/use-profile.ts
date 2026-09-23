import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getProfile, updateAvatar, updateDisplayName } from '@/data/profile';
import { useAuth } from '@/hooks/use-auth';
import type { AvatarId } from '@/lib/avatars';
import { queryKeys } from '@/lib/query-keys';

/**
 * Profil de l'utilisateur connecté, et modification de son nom affiché et de son avatar.
 *
 * Les mutations n'invalident que le profil. La liste des membres d'un groupe et l'aperçu des groupes se rechargent déjà à chaque ouverture, et le journal garde volontairement le nom tel qu'il était au moment de l'action.
 */
export function useProfile() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const query = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: () => getProfile(userId as string),
    enabled: userId !== null,
  });

  const rename = useMutation({
    mutationFn: (displayName: string) => updateDisplayName(userId as string, displayName),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
    },
  });

  const chooseAvatar = useMutation({
    mutationFn: (avatar: AvatarId | null) => updateAvatar(userId as string, avatar),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
    },
  });

  return {
    profile: query.data,
    isLoading: query.isLoading,
    error: query.error,
    rename,
    isRenaming: rename.isPending,
    chooseAvatar,
    isChoosingAvatar: chooseAvatar.isPending,
  };
}
