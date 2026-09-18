import { useQuery } from '@tanstack/react-query';

import { getPeriodSummary, type PeriodSummary } from '@/data/summary';
import { useActiveGroup } from '@/hooks/use-active-group';
import { formatPeriodLabel, periodBounds, periodPresets, todayIso } from '@/lib/dates';
import { queryKeys } from '@/lib/query-keys';

/** Repli quand le groupe actif n'est pas encore résolu : le mois calendaire. */
const DEFAULT_START_DAY = 1;

/**
 * Résumé de la période en cours pour le groupe actif, et celui de la précédente pour la comparaison de la spec 2.6.
 *
 * Le libellé est renvoyé avec les chiffres parce qu'il dépend des mêmes bornes : les recalculer dans le composant ferait diverger l'en-tête et les totaux à l'instant où la période bascule.
 *
 * Les deux périodes sont deux requêtes distinctes sur la même fonction, chacune avec sa propre clé de cache : la précédente ne bouge plus une fois close, et la partager avec le filtre « Précédente » de l'historique évite de la redemander.
 */
export function usePeriodSummary(): {
  summary: PeriodSummary | undefined;
  /** Période précédente, pour la comparaison. `undefined` tant qu'elle charge. */
  previous: PeriodSummary | undefined;
  label: string;
  isLoading: boolean;
  error: unknown;
} {
  const { activeGroupId, activeGroup } = useActiveGroup();
  const startDay = activeGroup?.periodStartDay ?? DEFAULT_START_DAY;
  const today = todayIso();

  const { from, to } = periodBounds(today, startDay);
  // Réutilise le préréglage plutôt que de refaire l'arithmétique des mois : la borne de la période précédente est déjà calculée et couverte par les tests.
  const presets = periodPresets(today, startDay);
  const previousPreset = presets.find((preset) => preset.id === 'previous');

  const current = useQuery({
    // `from` fait partie de la clé : changer le jour de démarrage, ou passer au mois suivant, produit une entrée neuve sans invalidation à écrire.
    queryKey: queryKeys.periodSummary(activeGroupId ?? '', from),
    queryFn: () => getPeriodSummary(activeGroupId as string, from, to),
    enabled: activeGroupId !== null,
  });

  const previous = useQuery({
    queryKey: queryKeys.periodSummary(activeGroupId ?? '', previousPreset?.from ?? ''),
    queryFn: () =>
      getPeriodSummary(
        activeGroupId as string,
        previousPreset?.from as string,
        previousPreset?.to as string
      ),
    enabled: activeGroupId !== null && previousPreset !== undefined,
  });

  return {
    summary: current.data,
    previous: previous.data,
    label: formatPeriodLabel(from, to),
    // Seule la période en cours conditionne l'affichage : la comparaison est un complément, et attendre sa réponse retarderait le solde sans raison.
    isLoading: current.isLoading,
    error: current.error,
  };
}
