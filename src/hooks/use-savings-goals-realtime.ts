import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { uniqueChannelName } from '@/data/realtime';
import { useAuth } from '@/hooks/use-auth';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/**
 * Sync temps réel des objectifs d'épargne de l'utilisateur courant.
 *
 * Les insertions et modifications arrivent ici, filtrées sur user_id. Un DELETE ne porte que l'id, jamais user_id, et Supabase ne lui applique pas RLS : la base annonce la suppression sur le canal privé de l'utilisateur, qu'écoute useDeletionBroadcasts().
 */
export function useSavingsGoalsRealtime(): void {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) {
      return;
    }

    function invalidate() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savingsGoals() });
    }

    const channel = supabase
      .channel(uniqueChannelName(`savings-goals:${userId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'savings_goals',
          filter: `user_id=eq.${userId}`,
        },
        invalidate
      )
      .subscribe((status) => {
        // SUBSCRIBED se déclenche à la connexion initiale comme après une reconnexion : invalider là rattrape ce qui a changé pendant le trou.
        if (status === 'SUBSCRIBED') {
          invalidate();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
