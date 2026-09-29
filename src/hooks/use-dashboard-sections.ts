import { useBudgetProgress } from '@/hooks/use-budget-progress';
import { useDebtTotals } from '@/hooks/use-debts';
import { useSavingsGoals } from '@/hooks/use-savings-goals';
import { useWallets } from '@/hooks/use-wallets';

export type DashboardSection = 'wallets' | 'budgets' | 'savings' | 'debts';

/**
 * Les cartes secondaires de la Synthèse qui ont quelque chose à montrer.
 *
 * Un compte neuf voyait six cartes à zéro sous son solde, sans savoir par où commencer. Une carte n'apparaît qu'une fois utilisée ; les autres sont rassemblées dans « Aller plus loin » (`DiscoverMore`), une ligne chacune.
 *
 * Mêmes requêtes que les cartes elles-mêmes, donc aucune lecture de plus : TanStack Query partage le cache entre les deux. Une carte n'est masquée que si sa donnée est arrivée et vide ; tant qu'elle charge, ou si elle a échoué, elle reste visible avec son propre état — mieux vaut une carte en trop qu'une donnée existante cachée.
 */
export function useDashboardSections(): Record<DashboardSection, boolean> {
  const wallets = useWallets();
  const budgets = useBudgetProgress();
  const savings = useSavingsGoals();
  const debts = useDebtTotals();

  return {
    // Le seul portefeuille « Principal », créé avec le groupe, n'est pas encore un usage : la carte vient avec le deuxième.
    wallets: wallets.isLoading || wallets.error !== null || wallets.wallets.length > 1,
    budgets: budgets.isLoading || budgets.error !== null || budgets.items.length > 0,
    savings: savings.isLoading || savings.error !== null || savings.goals.length > 0,
    debts: debts.isLoading || (debts.totals !== undefined && debts.totals.openCount > 0),
  };
}
