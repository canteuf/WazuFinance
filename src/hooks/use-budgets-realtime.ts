import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { uniqueChannelName } from '@/data/realtime';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/**
 * Sync temps réel des budgets du groupe actif (spec 4.2) : un plafond posé par un membre apparaît chez l'autre sans recharger l'app.
 *
 * Les policies RLS s'appliquent aussi aux messages Realtime — un abonné ne reçoit que ce qu'il a le droit de lire. Le filtre serveur ci-dessous n'est donc pas une mesure de sécurité, seulement une économie de trafic.
 *
 * Les suppressions arrivent par useDeletionBroadcasts() : un DELETE ne porte pas `group_id`, le filtre ne peut pas s'y appliquer.
 *
 * On invalide `queryKeys.budgetsAll()` (la racine `['budgets']`), pas `queryKeys.budgets(activeGroupId)` : l'événement Realtime arrive de façon asynchrone, et le groupe actif peut avoir changé entre l'émission et la réception. Invalider seulement la clé du groupe actif au moment de la réponse viserait le mauvais groupe si l'utilisateur a basculé entre-temps. La racine touche toutes les entrées de groupe en cache, ce qui est voulu.
 */
export function useBudgetsRealtime(): void {
  const queryClient = useQueryClient();
  const { activeGroupId } = useActiveGroup();

  useEffect(() => {
    if (!activeGroupId) {
      return;
    }

    function invalidate() {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.budgetsAll(),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.budgetTotalsAll() });
    }

    const channel = supabase
      .channel(uniqueChannelName(`budgets:${activeGroupId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budgets',
          filter: `group_id=eq.${activeGroupId}`,
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
  }, [activeGroupId, queryClient]);
}
