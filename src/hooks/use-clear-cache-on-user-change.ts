import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/hooks/use-auth';

/**
 * Vide le cache TanStack Query dès qu'un changement d'utilisateur est détecté, pour qu'un second utilisateur sur le même appareil ne voie jamais, même brièvement via stale-while-revalidate, les groupes ou transactions mis en cache par le précédent — les clés de cache ne sont pas scindées par utilisateur.
 */
export function useClearCacheOnUserChange(): void {
  const { session, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  // undefined tant qu'aucun rendu n'a encore relevé l'utilisateur courant.
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // Tant que isLoading est vrai, le null de session est un placeholder en attente de la lecture async de la session persistée, pas une absence de session observée : on ne baseline la référence qu'une fois résolue, sinon le premier utilisateur déjà connecté déclenche un clear au démarrage.
    if (isLoading) {
      return;
    }
    // On ignore le premier rendu résolu : ce n'est pas un changement d'utilisateur, seulement la lecture initiale de la session persistée.
    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      queryClient.clear();
    }
    previousUserId.current = userId;
  }, [userId, isLoading, queryClient]);
}
