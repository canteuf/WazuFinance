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
        () => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.transactions(),
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeGroupId, queryClient]);
}
