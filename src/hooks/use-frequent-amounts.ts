import { useQuery } from '@tanstack/react-query';

import { getFrequentAmounts } from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';
import type { TransactionType } from '@/types/database';

/**
 * Montants fréquents de l'utilisateur pour la saisie. Une commodité : en échec ou en chargement, la saisie fonctionne sans eux, et rien n'est affiché à leur place.
 */
export function useFrequentAmounts(type: TransactionType): number[] {
  const { activeGroupId } = useActiveGroup();

  const query = useQuery({
    queryKey: queryKeys.frequentAmounts(activeGroupId ?? '', type),
    queryFn: () => getFrequentAmounts(activeGroupId as string, type),
    enabled: activeGroupId !== null,
  });

  return query.data ?? [];
}
