import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/**
 * Sync temps réel des transactions du groupe actif (spec 4.2) : un membre voit
 * les dépenses de l'autre sans recharger l'app.
 *
 * Les policies RLS s'appliquent aussi aux messages Realtime — un abonné ne
 * reçoit que ce qu'il a le droit de lire. Le filtre serveur ci-dessous n'est
 * donc pas une mesure de sécurité, seulement une économie de trafic.
 *
 * On invalide le préfixe racine `queryKeys.transactions()` plutôt que la
 * seule feuille `recentTransactions(groupId)` : TanStack Query ne fait
 * correspondre une invalidation que si la clé invalidée est un préfixe de la
 * clé en cache, jamais l'inverse. Invalider la feuille ne toucherait jamais
 * `['transactions', 'detail', id]`, laissant une fiche de modification
 * ouverte sur une valeur périmée si un autre membre modifie la même
 * transaction pendant qu'elle est affichée.
 */
export function useTransactionsRealtime(): void {
  const queryClient = useQueryClient();
  const { activeGroupId } = useActiveGroup();

  useEffect(() => {
    if (!activeGroupId) {
      return;
    }

    function invalidate() {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.transactions(),
      });
    }

    const channel = supabase
      .channel(`transactions:${activeGroupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `group_id=eq.${activeGroupId}`,
        },
        invalidate
      )
      // Second abonnement DELETE, volontairement sans filtre serveur.
      // La migration de schéma n'active pas `replica identity full` sur
      // `transactions` (choix délibéré : Supabase n'applique pas RLS aux
      // événements DELETE, donc une identité complète diffuserait la ligne
      // entière — tous ses champs, pas seulement l'id — à tout abonné). Sans
      // elle, l'ancien tuple d'un DELETE ne porte que la clé primaire, sans
      // `group_id` : le filtre `group_id=eq.…` de l'abonnement ci-dessus ne
      // peut donc jamais correspondre à une suppression, et un membre voit
      // une ligne que l'autre a déjà supprimée. Cet abonnement-ci ne reçoit
      // que des identifiants (aucune fuite) et se contente d'invalider,
      // quitte à recharger pour un groupe qui n'est pas affiché. Ne pas le
      // fusionner dans l'abonnement filtré au-dessus : ça réintroduirait le
      // bug (en gardant le filtre) ou la fuite (en posant l'identité complète).
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'transactions' },
        invalidate
      )
      .subscribe((status) => {
        // CHANNEL_ERROR et TIMED_OUT seraient sinon silencieux. SUBSCRIBED se
        // déclenche aussi bien à la connexion initiale qu'à une reconnexion
        // après une coupure : invalider à ce moment-là rattrape tout ce qui a
        // pu changer côté serveur pendant le trou, que la reconnexion vienne
        // du retour au premier plan (focusManager, voir query-provider.tsx)
        // ou du réseau qui revient.
        if (status === 'SUBSCRIBED') {
          invalidate();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeGroupId, queryClient]);
}
