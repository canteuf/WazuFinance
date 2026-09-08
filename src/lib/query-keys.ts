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
  recentTransactions: (groupId: string) => ['transactions', 'recent', groupId] as const,
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
  transactionHistory: (groupId: string, filters: TransactionFilters) =>
    ['transactions', 'history', groupId, filters] as const,
};
