import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { uniqueChannelName } from '@/data/realtime';
import { useActiveGroup } from '@/hooks/use-active-group';
import { ownTransactionWrites } from '@/lib/own-writes';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/** Fenêtre pendant laquelle les événements Realtime s'additionnent en un seul rechargement. Assez courte pour que la saisie d'un autre membre paraisse immédiate. */
const REALTIME_BATCH_MS = 1_500;

/**
 * Sync temps réel des transactions du groupe actif (spec 4.2) : un membre voit les dépenses de l'autre sans recharger l'app.
 *
 * Les policies RLS s'appliquent aussi aux messages Realtime — un abonné ne reçoit que ce qu'il a le droit de lire. Le filtre serveur ci-dessous n'est donc pas une mesure de sécurité, seulement une économie de trafic.
 *
 * Les suppressions n'arrivent pas ici : un DELETE ne porte que la clé primaire, sans `group_id`, donc le filtre ne peut pas s'y appliquer, et Supabase n'applique pas RLS aux DELETE. La base les annonce sur le canal privé du groupe, qu'écoute useDeletionBroadcasts().
 *
 * On invalide le préfixe racine `queryKeys.transactions()` plutôt que la seule feuille `recentTransactions(groupId)` : TanStack Query ne fait correspondre une invalidation que si la clé invalidée est un préfixe de la clé en cache, jamais l'inverse. Invalider la feuille ne toucherait jamais `['transactions', 'detail', id]`, laissant une fiche de modification ouverte sur une valeur périmée si un autre membre modifie la même transaction pendant qu'elle est affichée.
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

    // Les événements d'une rafale — une réunion de tontine où chacun saisit sa cotisation — ne déclenchent qu'un rechargement, à la fin de la fenêtre. Chaque invalidation relit toutes les requêtes affichées, pages d'historique comprises : une par ligne saisie coûtait cher sur un réseau 2G.
    let pending: ReturnType<typeof setTimeout> | undefined;
    function invalidateSoon() {
      if (pending !== undefined) {
        return;
      }
      pending = setTimeout(() => {
        pending = undefined;
        invalidate();
      }, REALTIME_BATCH_MS);
    }

    // L'écho d'une ligne que ce téléphone vient d'écrire n'apporte rien : le succès de l'écriture a déjà rechargé (own-writes.ts).
    function onChange(payload: { new?: unknown }) {
      const row = payload.new as { id?: unknown } | undefined;
      if (ownTransactionWrites.isEcho(row?.id)) {
        return;
      }
      invalidateSoon();
    }

    const channel = supabase
      .channel(uniqueChannelName(`transactions:${activeGroupId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `group_id=eq.${activeGroupId}`,
        },
        onChange
      )
      .subscribe((status) => {
        // SUBSCRIBED se déclenche aussi bien à la connexion initiale qu'à une reconnexion après une coupure : invalider à ce moment-là rattrape tout ce qui a pu changer côté serveur pendant le trou, que la reconnexion vienne du retour au premier plan (focusManager, voir query-provider.tsx) ou du réseau qui revient.
        if (status === 'SUBSCRIBED') {
          invalidate();
        }
      });

    return () => {
      clearTimeout(pending);
      void supabase.removeChannel(channel);
    };
  }, [activeGroupId, queryClient]);
}
