import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { uniqueChannelName } from '@/data/realtime';
import { useAuth } from '@/hooks/use-auth';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/**
 * Sync temps réel des adhésions : un membre exclu voit le groupe disparaître de sa liste sans recharger l'app, et le propriétaire voit arriver celui qui vient de rejoindre avec un code.
 *
 * INSERT et UPDATE, sans filtre serveur : RLS s'applique aux messages Realtime, un abonné ne reçoit que les adhésions des groupes dont il est membre. Les suppressions — un départ, une exclusion — n'arrivent pas ici : Supabase n'applique pas RLS aux DELETE, et l'abonnement à `*` faisait recharger la liste des groupes de tous les clients connectés à chaque départ dans n'importe quel groupe. La base annonce désormais la suppression sur le canal privé du groupe et sur celui de la personne qui part ou est exclue (useDeletionBroadcasts()).
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
      .channel(uniqueChannelName(`memberships:${userId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'account_memberships' }, invalidate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'account_memberships' }, invalidate)
      // Le nom et le jour de début de période d'un groupe arrivent avec les adhésions (listMemberships). Sans cet abonnement, un propriétaire qui déplaçait le début de période ne le faisait voir aux autres membres qu'à leur prochain rechargement, et leurs totaux décrivaient une autre période que les siens. UPDATE seulement : une création ou une suppression de groupe passe déjà par les adhésions. RLS filtre les messages comme les lectures.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'budget_groups' }, invalidate)
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
