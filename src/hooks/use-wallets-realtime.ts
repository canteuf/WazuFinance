import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/**
 * Sync temps réel des portefeuilles et des transferts du groupe actif : un transfert fait par un membre met à jour les soldes chez les autres. Les opérations ont déjà leur propre abonnement (useTransactionsRealtime), qui invalide toute la racine ['transactions'], soldes compris.
 *
 * Même construction que useBudgetsRealtime() : filtre serveur par groupe pour l'économie de trafic, second abonnement DELETE sans filtre (un DELETE ne porte que la clé primaire), invalidation par les racines.
 */
export function useWalletsRealtime(): void {
  const queryClient = useQueryClient();
  const { activeGroupId } = useActiveGroup();

  useEffect(() => {
    if (!activeGroupId) {
      return;
    }

    function invalidate() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.walletsAll() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transfersAll() });
    }

    const channel = supabase
      .channel(`wallets:${activeGroupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallets', filter: `group_id=eq.${activeGroupId}` },
        invalidate
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'wallets' }, invalidate)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wallet_transfers',
          filter: `group_id=eq.${activeGroupId}`,
        },
        invalidate
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          invalidate();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeGroupId, queryClient]);
}
