import { useMemo } from 'react';

import { useBudgets } from '@/hooks/use-budgets';
import { useCategoryBreakdown } from '@/hooks/use-category-breakdown';
import { budgetProgress, type BudgetProgress } from '@/lib/budget-progress';

/**
 * Budgets rapprochés des dépenses de la période en cours.
 *
 * Les bornes viennent de `useCategoryBreakdown`, donc les mêmes que le solde et la répartition du tableau de bord : un plafond comparé à une autre période que celle affichée en tête d'écran serait un chiffre faux.
 *
 * Les deux requêtes sont indépendantes et déjà en cache pour l'une d'elles : la répartition est lue par le tableau de bord, donc le bandeau ne coûte que la lecture des plafonds.
 */
export function useBudgetProgress(): {
  items: BudgetProgress[];
  isLoading: boolean;
  error: unknown;
  /**
   * Vrai quand l'une des deux lectures n'a jamais abouti : il n'y a alors rien de juste à montrer. Faux après l'échec d'un simple rafraîchissement, où TanStack garde les dernières données valides.
   */
  isEmptyError: boolean;
} {
  const budgets = useBudgets();
  const breakdown = useCategoryBreakdown();
  // La semaine n'est lue que si un budget hebdomadaire existe : la plupart des groupes n'en ont aucun.
  const hasWeekly = budgets.budgets.some((budget) => budget.period === 'weekly');
  const week = useCategoryBreakdown({ scope: 'week', enabled: hasWeekly });

  const items = useMemo(
    () => budgetProgress(budgets.budgets, breakdown.slices, week.slices),
    [budgets.budgets, breakdown.slices, week.slices]
  );

  return {
    items,
    // Les deux comptent : afficher des plafonds sans leur consommation montrerait un instant chaque budget à 0 %, donc tous « ok ».
    isLoading: budgets.isLoading || breakdown.isLoading || (hasWeekly && week.isLoading),
    error: budgets.error ?? breakdown.error ?? week.error,
    // Les deux, pour la même raison : des plafonds chargés sans leur consommation se liraient tous à 0 %, donc tous « ok ».
    isEmptyError: budgets.isLoadingError || breakdown.isLoadingError || week.isLoadingError,
  };
}
