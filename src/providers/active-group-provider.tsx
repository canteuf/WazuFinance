import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { listMemberships, type MembershipSummary } from '@/data/groups';
import { useAuth } from '@/hooks/use-auth';
import { readLastGroup, writeLastGroup } from '@/lib/last-used';
import { queryKeys } from '@/lib/query-keys';

export type ActiveGroupState = {
  groups: MembershipSummary[];
  activeGroupId: string | null;
  activeGroup: MembershipSummary | null;
  setActiveGroupId: (groupId: string) => void;
  isLoading: boolean;
  error: unknown;
};

export const ActiveGroupContext = createContext<ActiveGroupState | null>(null);

/**
 * Groupe courant de l'app.
 *
 * Le compte personnel est un budget_group comme un autre : il arrive en tête de la liste et sert de valeur initiale, sans chemin de code distinct.
 *
 * Le dernier groupe choisi est retenu par compte (`readLastGroup`) et rouvert au lancement. Tant qu'il n'est pas relu, `isLoading` reste vrai : les écrans attendent au lieu d'afficher un instant les chiffres du compte personnel.
 */
export function ActiveGroupProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.memberships(),
    queryFn: () => listMemberships(userId as string),
    enabled: userId !== undefined,
  });

  const groups = useMemo(() => data ?? [], [data]);

  // Choix explicite, avec le compte qui l'a fait : un autre compte connecté ensuite sur le même téléphone ne l'hérite pas.
  const [selection, setSelection] = useState<{ userId: string; groupId: string } | null>(null);
  const selectedGroupId = selection !== null && selection.userId === userId ? selection.groupId : null;
  // Compte dont le dernier choix a été relu ; différent du compte courant pendant la lecture, qui ne prend que quelques millisecondes.
  const [restoredFor, setRestoredFor] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let active = true;
    void readLastGroup(userId).then((stored) => {
      if (!active) {
        return;
      }
      // Un choix fait pendant la lecture l'emporte sur le choix enregistré.
      setSelection((current) =>
        current !== null && current.userId === userId
          ? current
          : stored !== null
            ? { userId, groupId: stored }
            : current
      );
      setRestoredFor(userId);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const setActiveGroupId = useCallback(
    (groupId: string) => {
      if (!userId) {
        return;
      }
      setSelection({ userId, groupId });
      void writeLastGroup(userId, groupId);
    },
    [userId]
  );

  // Groupe actif dérivé : le choix explicite s'il est toujours valide, sinon le premier de la liste (le compte personnel). Dérivé au rendu plutôt que synchronisé par effet, pour couvrir sans état supplémentaire aussi bien la sélection initiale que le rattrapage si le groupe actif disparaît (départ d'un groupe partagé, par exemple).
  const activeGroupId =
    selectedGroupId !== null && groups.some((group) => group.groupId === selectedGroupId)
      ? selectedGroupId
      : (groups[0]?.groupId ?? null);

  const value = useMemo<ActiveGroupState>(
    () => ({
      groups,
      activeGroupId,
      activeGroup: groups.find((group) => group.groupId === activeGroupId) ?? null,
      setActiveGroupId,
      isLoading: isLoading || (userId !== undefined && restoredFor !== userId),
      error,
    }),
    [groups, activeGroupId, setActiveGroupId, isLoading, userId, restoredFor, error]
  );

  return <ActiveGroupContext.Provider value={value}>{children}</ActiveGroupContext.Provider>;
}
