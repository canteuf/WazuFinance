import { useQuery } from '@tanstack/react-query';

import { listForGroup, type RecurringWithCategory } from '@/data/recurring';
import { useActiveGroup } from '@/hooks/use-active-group';
import { todayIso } from '@/lib/dates';
import { queryKeys } from '@/lib/query-keys';

/**
 * Modèles récurrents du groupe actif, et ceux dont l'échéance est arrivée.
 *
 * `due` compare à la date de l'appareil, pas du serveur (UTC) : un loyer du 5 doit apparaître le 5 au matin à Douala. Le filtre se fait ici plutôt qu'en base : la liste entière sert aussi à l'écran de gestion, et elle tient en quelques lignes.
 */
export function useRecurring(): {
  recurring: RecurringWithCategory[];
  due: RecurringWithCategory[];
  isLoading: boolean;
  error: unknown;
} {
  const { activeGroupId } = useActiveGroup();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.recurring(activeGroupId ?? ''),
    queryFn: () => listForGroup(activeGroupId as string),
    enabled: activeGroupId !== null,
  });

  const recurring = data ?? [];
  const today = todayIso();
  // Comparaison de chaînes `YYYY-MM-DD` : l'ordre alphabétique est l'ordre des dates.
  const due = recurring.filter((item) => item.next_due_on <= today);

  return { recurring, due, isLoading, error };
}
