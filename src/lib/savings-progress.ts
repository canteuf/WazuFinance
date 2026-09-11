import type { SavingsGoal } from '@/data/savings-goals';

export type SavingsStatus = 'in_progress' | 'reached';

export type SavingsProgress = {
  goal: SavingsGoal;
  /** Peut dépasser 100 : c'est l'affichage qui plafonne la barre, pas le calcul. */
  percent: number;
  status: SavingsStatus;
};

/**
 * Progression d'un objectif d'épargne.
 *
 * `target_amount > 0` est garanti par la contrainte `check` de la table :
 * pas de garde contre la division par zéro, elle serait du code mort.
 *
 * Pas de palier d'alerte façon budgets (80 %/100 %) : la spec 2.5 ne demande
 * qu'une barre ou un pourcentage, contrairement à la spec 2.4 qui fixe des
 * seuils explicites pour les budgets.
 */
export function savingsProgress(goal: SavingsGoal): SavingsProgress {
  const percent = Math.round((goal.current_amount / goal.target_amount) * 100);
  const status: SavingsStatus =
    goal.current_amount >= goal.target_amount ? 'reached' : 'in_progress';

  return { goal, percent, status };
}
