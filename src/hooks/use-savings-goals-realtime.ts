import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/**
 * Sync temps réel des objectifs d'épargne de l'utilisateur courant.
 *
 * Deux abonnements, comme use-budgets-realtime.ts et pour la même raison :
 * aucune table du projet n'a de `replica identity full` (vérifié dans les
 * migrations), donc l'ancien tuple d'un DELETE ne porte que l'id, jamais
 * user_id — un filtre serveur sur user_id ne peut donc jamais le matcher. Le
 * second abonnement, sans filtre serveur, se contente d'invalider ; RLS
 * s'applique aux deux, ce n'est qu'une économie de trafic.
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
      .channel(`savings-goals:${userId}`)
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
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'savings_goals' },
        invalidate
      )
      .subscribe((status) => {
        // SUBSCRIBED se déclenche à la connexion initiale comme après une
        // reconnexion : invalider là rattrape ce qui a changé pendant le trou.
        if (status === 'SUBSCRIBED') {
          invalidate();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
