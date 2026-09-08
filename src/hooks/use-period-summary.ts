import { useQuery } from '@tanstack/react-query';

import { getPeriodSummary, type PeriodSummary } from '@/data/summary';
import { useActiveGroup } from '@/hooks/use-active-group';
import { formatPeriodLabel, periodBounds, todayIso } from '@/lib/dates';
import { queryKeys } from '@/lib/query-keys';

/** Repli quand le groupe actif n'est pas encore résolu : le mois calendaire. */
const DEFAULT_START_DAY = 1;

/**
 * Résumé de la période en cours pour le groupe actif.
 *
 * Le libellé est renvoyé avec les chiffres parce qu'il dépend des mêmes
 * bornes : les recalculer dans le composant ferait diverger l'en-tête et les
 * totaux à l'instant où la période bascule.
 */
export function usePeriodSummary(): {
  summary: PeriodSummary | undefined;
  label: string;
  isLoading: boolean;
  error: unknown;
} {
  const { activeGroupId, activeGroup } = useActiveGroup();
  const { from, to } = periodBounds(
    todayIso(),
    activeGroup?.periodStartDay ?? DEFAULT_START_DAY
  );

  const { data, isLoading, error } = useQuery({
    // `from` fait partie de la clé : changer le jour de démarrage, ou passer
    // au mois suivant, produit une entrée neuve sans invalidation à écrire.
    queryKey: queryKeys.periodSummary(activeGroupId ?? '', from),
    queryFn: () => getPeriodSummary(activeGroupId as string, from, to),
    enabled: activeGroupId !== null,
  });

  return { summary: data, label: formatPeriodLabel(from, to), isLoading, error };
}
