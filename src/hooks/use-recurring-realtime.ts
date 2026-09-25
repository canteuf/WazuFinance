import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/**
 * Sync temps réel des modèles récurrents du groupe actif : le loyer confirmé par un membre disparaît aussitôt de la liste « À confirmer » des autres, qui ne le confirmeront pas une seconde fois. Même construction que useBudgetsRealtime(), dont les commentaires valent ici : filtre serveur par groupe pour l'économie de trafic, second abonnement DELETE sans filtre, invalidation par la racine.
 */
export function useRecurringRealtime(): void {
  const queryClient = useQueryClient();
  const { activeGroupId } = useActiveGroup();

  useEffect(() => {
    if (!activeGroupId) {
      return;
    }

    function invalidate() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.recurringAll() });
    }

    const channel = supabase
      .channel(`recurring:${activeGroupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recurring_transactions',
          filter: `group_id=eq.${activeGroupId}`,
        },
        invalidate
      )
      // Voir useBudgetsRealtime() : un DELETE ne porte que la clé primaire, le filtre par groupe ne peut pas s'y appliquer.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'recurring_transactions' },
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
  }, [activeGroupId, queryClient]);
}
