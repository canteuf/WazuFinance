// Import de type seulement : aucune dépendance à l'exécution, donc le sens des
// couches (data → lib) reste intact.
import type { TransactionFilters } from '@/data/transactions';

/**
 * Clés de cache TanStack Query, centralisées.
 *
 * Les invalidations se font par préfixe : invalider ['transactions'] touche
 * la liste récente et les détails. Éparpiller les clés dans les hooks conduit
 * tôt ou tard à une invalidation qui rate sa cible.
 */
export const queryKeys = {
  memberships: () => ['memberships'] as const,
  categories: (groupId: string) => ['categories', groupId] as const,
  transactions: () => ['transactions'] as const,
  // `from` fait partie de la clé, comme pour periodSummary : la liste du
  // tableau de bord est bornée à la période, donc une bascule de période doit
  // ouvrir une entrée neuve plutôt que réutiliser celle de la précédente.
  recentTransactions: (groupId: string, from: string) =>
    ['transactions', 'recent', groupId, from] as const,
  transaction: (id: string) => ['transactions', 'detail', id] as const,
  // Imbriquée sous ['transactions'] à dessein : le résumé est dérivé des
  // transactions, et les mutations comme le Realtime invalident déjà ce
  // préfixe. Le solde se rafraîchit donc seul, sans que use-transaction-
  // mutations ni use-transactions-realtime aient à connaître son existence.
  periodSummary: (groupId: string, from: string) =>
    ['transactions', 'summary', groupId, from] as const,
  // Imbriquée sous ['transactions'] comme periodSummary : elle hérite des
  // invalidations posées par les mutations et le Realtime. Les filtres entrent
  // dans la clé, donc changer de filtre ouvre une entrée neuve au lieu
  // d'écraser la précédente — revenir à un filtre déjà vu est immédiat.
  // Même imbrication que periodSummary, pour la même raison : dérivée des
  // transactions, donc invalidée par le préfixe déjà en place.
  categoryBreakdown: (groupId: string, from: string) =>
    ['transactions', 'breakdown', groupId, from] as const,
  transactionHistory: (groupId: string, filters: TransactionFilters) =>
    ['transactions', 'history', groupId, filters] as const,
};
