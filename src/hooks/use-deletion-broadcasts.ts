import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { openPrivateChannel } from '@/data/realtime';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/** Même fenêtre que useTransactionsRealtime() : une rafale de suppressions ne recharge qu'une fois. */
const DELETION_BATCH_MS = 1_500;

/** Ce que chaque table supprimée rend périmé. Les clés sont des racines : un événement peut arriver après un changement de groupe actif. */
function invalidateFor(queryClient: QueryClient, table: string): void {
  switch (table) {
    case 'transactions':
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
      return;
    case 'budgets':
      void queryClient.invalidateQueries({ queryKey: queryKeys.budgetsAll() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.budgetTotalsAll() });
      return;
    case 'wallets':
      void queryClient.invalidateQueries({ queryKey: queryKeys.walletsAll() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transfersAll() });
      return;
    case 'recurring_transactions':
      void queryClient.invalidateQueries({ queryKey: queryKeys.recurringAll() });
      return;
    case 'account_memberships':
      void queryClient.invalidateQueries({ queryKey: queryKeys.memberships() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.groupMembersAll() });
      return;
    case 'savings_goals':
      void queryClient.invalidateQueries({ queryKey: queryKeys.savingsGoals() });
      return;
  }
}

/**
 * Les suppressions, annoncées par la base sur des canaux privés (migration 20261012000200_deletion_broadcasts.sql) : « group:<id> » pour le groupe actif, « user:<id> » pour les objectifs d'épargne et l'exclusion de l'utilisateur.
 *
 * Supabase n'applique ni RLS ni filtre aux événements DELETE de postgres_changes : les abonnements DELETE sans filtre qu'avaient les hooks Realtime faisaient recevoir à chaque client toutes les suppressions de la base, avec leur identifiant. Les autres événements restent dans ces hooks, filtrés par groupe et soumis à RLS.
 */
export function useDeletionBroadcasts(): void {
  const queryClient = useQueryClient();
  const { activeGroupId } = useActiveGroup();
  const { session } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!activeGroupId || !userId) {
      return;
    }

    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onDeleted(message: { payload?: { table?: unknown } }) {
      const table = message.payload?.table;
      if (typeof table !== 'string') {
        return;
      }
      pending.add(table);
      if (timer !== undefined) {
        return;
      }
      timer = setTimeout(() => {
        timer = undefined;
        for (const name of pending) {
          invalidateFor(queryClient, name);
        }
        pending.clear();
      }, DELETION_BATCH_MS);
    }

    let cancelled = false;
    const channels: RealtimeChannel[] = [];
    for (const topic of [`group:${activeGroupId}`, `user:${userId}`]) {
      void openPrivateChannel(topic).then((channel) => {
        if (cancelled) {
          return;
        }
        channels.push(channel.on('broadcast', { event: 'deleted' }, onDeleted).subscribe());
      });
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [activeGroupId, userId, queryClient]);
}
