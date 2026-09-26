import { useQuery } from '@tanstack/react-query';

import { getTransactionTags } from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';

/**
 * Étiquettes déjà utilisées dans le groupe actif, les plus fréquentes d'abord. Une commodité, comme les montants fréquents : en échec ou en chargement, la saisie et le filtre fonctionnent sans elles.
 */
export function useTransactionTags(): string[] {
  const { activeGroupId } = useActiveGroup();

  const query = useQuery({
    queryKey: queryKeys.transactionTags(activeGroupId ?? ''),
    queryFn: () => getTransactionTags(activeGroupId as string),
    enabled: activeGroupId !== null,
  });

  return query.data ?? [];
}
