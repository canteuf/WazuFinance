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
  recentTransactions: (groupId: string) => ['transactions', 'recent', groupId] as const,
  transaction: (id: string) => ['transactions', 'detail', id] as const,
};
