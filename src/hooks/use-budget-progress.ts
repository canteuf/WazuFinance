import { useMemo } from 'react';

import { useBudgets } from '@/hooks/use-budgets';
import { useCategoryBreakdown } from '@/hooks/use-category-breakdown';
import { budgetProgress, type BudgetProgress } from '@/lib/budget-progress';

/**
 * Budgets rapprochés des dépenses de la période en cours.
 *
 * Les bornes viennent de `useCategoryBreakdown`, donc les mêmes que le solde
 * et la répartition du tableau de bord : un plafond comparé à une autre
 * période que celle affichée en tête d'écran serait un chiffre faux.
 *
 * Les deux requêtes sont indépendantes et déjà en cache pour l'une d'elles :
 * la répartition est lue par le tableau de bord, donc le bandeau ne coûte que
 * la lecture des plafonds.
 */
export function useBudgetProgress(): {
  items: BudgetProgress[];
  isLoading: boolean;
  error: unknown;
} {
  const budgets = useBudgets();
  const breakdown = useCategoryBreakdown();

  const items = useMemo(
    () => budgetProgress(budgets.budgets, breakdown.slices),
    [budgets.budgets, breakdown.slices]
  );

  return {
    items,
    // Les deux comptent : afficher des plafonds sans leur consommation
    // montrerait un instant chaque budget à 0 %, donc tous « ok ».
    isLoading: budgets.isLoading || breakdown.isLoading,
    error: budgets.error ?? breakdown.error,
  };
}
