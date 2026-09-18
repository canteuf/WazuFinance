import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/**
 * Sync temps réel des budgets du groupe actif (spec 4.2) : un plafond posé par un membre apparaît chez l'autre sans recharger l'app.
 *
 * Les policies RLS s'appliquent aussi aux messages Realtime — un abonné ne reçoit que ce qu'il a le droit de lire. Le filtre serveur ci-dessous n'est donc pas une mesure de sécurité, seulement une économie de trafic.
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
    }

    const channel = supabase
      .channel(`budgets:${activeGroupId}`)
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
      // Second abonnement DELETE sans filtre serveur, pour la même raison que dans use-transactions-realtime : `replica identity` n'est pas complète (choix délibéré — Supabase n'applique pas RLS aux événements DELETE, donc une identité complète diffuserait la ligne entière). L'ancien tuple ne porte donc que la clé primaire, sans `group_id`, et le filtre ci-dessus ne peut jamais correspondre à une suppression. Cet abonnement-ci ne reçoit que des identifiants et se contente d'invalider. Ne pas le fusionner avec celui du dessus : ça réintroduirait le bug (en gardant le filtre) ou la fuite (en posant l'identité complète).
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'budgets' },
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
