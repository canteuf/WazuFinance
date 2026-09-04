import { useQuery } from '@tanstack/react-query';
import { createContext, useMemo, useState, type ReactNode } from 'react';

import { listMemberships, type MembershipSummary } from '@/data/groups';
import { queryKeys } from '@/lib/query-keys';

export type ActiveGroupState = {
  groups: MembershipSummary[];
  activeGroupId: string | null;
  activeGroup: MembershipSummary | null;
  setActiveGroupId: (groupId: string) => void;
  isLoading: boolean;
};

export const ActiveGroupContext = createContext<ActiveGroupState | null>(null);

/**
 * Groupe courant de l'app.
 *
 * Le compte personnel est un budget_group comme un autre : il arrive en tête
 * de la liste et sert de valeur initiale, sans chemin de code distinct.
 */
export function ActiveGroupProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.memberships(),
    queryFn: listMemberships,
  });

  const groups = useMemo(() => data ?? [], [data]);

  // Choix explicite de l'utilisateur ; null tant qu'il n'a rien choisi.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Groupe actif dérivé : le choix explicite s'il est toujours valide, sinon
  // le premier de la liste (le compte personnel). Dérivé au rendu plutôt que
  // synchronisé par effet, pour couvrir sans état supplémentaire aussi bien
  // la sélection initiale que le rattrapage si le groupe actif disparaît
  // (départ d'un groupe partagé, par exemple).
  const activeGroupId =
    selectedGroupId !== null && groups.some((group) => group.groupId === selectedGroupId)
      ? selectedGroupId
      : (groups[0]?.groupId ?? null);

  const value = useMemo<ActiveGroupState>(
    () => ({
      groups,
      activeGroupId,
      activeGroup: groups.find((group) => group.groupId === activeGroupId) ?? null,
      setActiveGroupId: setSelectedGroupId,
      isLoading,
    }),
    [groups, activeGroupId, isLoading]
  );

  return <ActiveGroupContext.Provider value={value}>{children}</ActiveGroupContext.Provider>;
}
