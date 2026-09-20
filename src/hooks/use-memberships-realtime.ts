import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/**
 * Sync temps réel des adhésions : un membre exclu voit le groupe disparaître de sa liste sans recharger l'app, et le propriétaire voit arriver celui qui vient de rejoindre avec un code.
 *
 * Un seul abonnement, sans filtre serveur. Pour INSERT et UPDATE, RLS s'applique aux messages Realtime : un abonné ne reçoit que les adhésions des groupes dont il est membre. Pour DELETE, Supabase n'applique pas RLS et l'ancien tuple ne porte que la clé primaire (`account_memberships` n'a pas `replica identity full`) — un `id` uuid, rien d'autre ne fuit. C'est justement ce qui fait marcher l'exclusion : au moment du DELETE, la ligne de l'exclu n'existe plus et aucune policy ne pourrait plus la lui montrer, et un filtre `user_id=eq.…` ne correspondrait jamais faute de `user_id` dans l'ancien tuple.
 *
 * Le prix : chaque suppression d'adhésion, dans n'importe quel groupe, recharge la liste des groupes de tous les clients connectés. C'est une requête légère, sur un événement rare.
 *
 * Quand le groupe actif disparaît de la liste, ActiveGroupProvider retombe de lui-même sur le compte personnel : rien d'autre à faire ici.
 */
export function useMembershipsRealtime(): void {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) {
      return;
    }

    function invalidate() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.memberships() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.groupMembersAll() });
    }

    const channel = supabase
      .channel(`memberships:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_memberships' }, invalidate)
      .subscribe((status) => {
        // Même raison que use-transactions-realtime : SUBSCRIBED suit aussi une reconnexion, invalider rattrape ce qui a changé pendant la coupure.
        if (status === 'SUBSCRIBED') {
          invalidate();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
