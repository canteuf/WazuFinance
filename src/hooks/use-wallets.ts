import { useQuery } from '@tanstack/react-query';

import { listTransfers, listWallets, type WalletOverview, type WalletTransfer } from '@/data/wallets';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';

/**
 * Portefeuilles d'un groupe, avec leur solde : le groupe actif par défaut. L'épargne passe le compte personnel, d'où partent ses versements quel que soit le groupe affiché.
 */
export function useWallets(groupId?: string | null): {
  wallets: WalletOverview[];
  isLoading: boolean;
  error: unknown;
} {
  const { activeGroupId } = useActiveGroup();
  const target = groupId === undefined ? activeGroupId : groupId;

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.wallets(target ?? ''),
    queryFn: () => listWallets(target as string),
    enabled: target !== null,
  });

  return { wallets: data ?? [], isLoading, error };
}

/** Nombre de transferts affichés sous les portefeuilles : l'écran montre les derniers, pas un historique complet. */
const RECENT_TRANSFERS = 10;

export function useRecentTransfers(): { transfers: WalletTransfer[]; isLoading: boolean } {
  const { activeGroupId } = useActiveGroup();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.transfers(activeGroupId ?? ''),
    queryFn: () => listTransfers(activeGroupId as string, RECENT_TRANSFERS),
    enabled: activeGroupId !== null,
  });

  return { transfers: data ?? [], isLoading };
}
