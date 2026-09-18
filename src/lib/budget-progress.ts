import type { BudgetWithCategory } from '@/data/budgets';
import type { CategorySlice } from '@/data/summary';

/**
 * Seuil d'avertissement de la spec 2.4.
 *
 * Nommé et exporté plutôt qu'écrit dans le JSX : les tests s'en servent pour viser la borne exacte, et le régler un jour se fait à un seul endroit.
 */
export const WARNING_RATIO = 0.8;

export type BudgetStatus = 'ok' | 'warning' | 'over';

export type BudgetProgress = {
  budget: BudgetWithCategory;
  spent: number;
  /** Signé : négatif en dépassement. L'affichage choisit le mot et prend la valeur absolue. */
  remaining: number;
  /** Peut dépasser 1 : c'est l'affichage qui plafonne la barre, pas le calcul. */
  ratio: number;
  status: BudgetStatus;
};

/** Les alertes en tête : c'est l'ordre utile, pas l'ordre alphabétique. */
const STATUS_RANK: Record<BudgetStatus, number> = {
  over: 0,
  warning: 1,
  ok: 2,
};

function statusFor(ratio: number): BudgetStatus {
  if (ratio >= 1) {
    return 'over';
  }
  if (ratio >= WARNING_RATIO) {
    return 'warning';
  }
  return 'ok';
}

/**
 * Rapproche chaque budget de la dépense de sa catégorie sur la période.
 *
 * Les deux ensembles viennent de deux requêtes portant les mêmes bornes : `listForGroup` pour les plafonds, `category_breakdown` pour les dépenses. La somme des montants a déjà été faite par Postgres sur du numeric(12,2) ; il ne reste ici qu'une correspondance par identifiant et une division de deux valeurs exactes. Additionner des montants ici, en revanche, passerait par des flottants binaires — ne pas le faire.
 *
 * `budget.amount > 0` est garanti par la contrainte `check (amount > 0)` de la table : pas de garde contre la division par zéro, elle serait du code mort.
 */
export function budgetProgress(
  budgets: BudgetWithCategory[],
  slices: CategorySlice[]
): BudgetProgress[] {
  const spentByCategory = new Map(slices.map((slice) => [slice.categoryId, slice.total]));

  return budgets
    .map((budget) => {
      // Absente de la répartition : la jointure interne de category_breakdown écarte les catégories sans dépense, elle ne les rend pas à zéro.
      const spent = spentByCategory.get(budget.category_id) ?? 0;
      const limit = budget.amount;
      const ratio = spent / limit;

      return {
        budget,
        spent,
        remaining: limit - spent,
        ratio,
        status: statusFor(ratio),
      };
    })
    .sort((a, b) => {
      const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      return byStatus !== 0 ? byStatus : b.ratio - a.ratio;
    });
}
