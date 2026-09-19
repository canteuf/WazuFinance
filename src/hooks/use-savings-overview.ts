import { useQuery } from '@tanstack/react-query';

import { getSavingsOverview, type SavingsOverview } from '@/data/savings-goals';
import { todayIso } from '@/lib/dates';
import { queryKeys } from '@/lib/query-keys';

/** Total épargné, effort mensuel et rythme de chaque objectif de l'utilisateur courant. */
export function useSavingsOverview(): { overview: SavingsOverview | undefined } {
  const today = todayIso();
  const { data } = useQuery({
    queryKey: queryKeys.savingsOverview(today),
    queryFn: () => getSavingsOverview(today),
  });

  // Pas d'état d'erreur exposé : l'en-tête et les rythmes s'effacent plutôt que d'afficher un chiffre faux, et la liste des objectifs, lue à part, reste utilisable.
  return { overview: data };
}
