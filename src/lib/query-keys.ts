// Import de type seulement : aucune dépendance à l'exécution, donc le sens des couches (data → lib) reste intact.
import type { TransactionFilters } from '@/data/transactions';

/**
 * Clés de cache TanStack Query, centralisées.
 *
 * Les invalidations se font par préfixe : invalider ['transactions'] touche la liste récente et les détails. Éparpiller les clés dans les hooks conduit tôt ou tard à une invalidation qui rate sa cible.
 */
export const queryKeys = {
  memberships: () => ['memberships'] as const,
  // Sous ['memberships'] : une adhésion créée, rejointe ou retirée change le nombre de membres, et les mutations de groupe invalident déjà ce préfixe. Un plafond modifié, lui, ne l'atteint pas ; l'écran recharge donc l'aperçu à chaque ouverture plutôt que d'apprendre aux mutations de budget qu'il existe.
  groupOverviews: () => ['memberships', 'overviews'] as const,
  // Racine réservée aux invalidations, comme budgetsAll : la réponse d'une création peut arriver après un changement de groupe actif.
  categoriesAll: () => ['categories'] as const,
  categories: (groupId: string) => ['categories', groupId] as const,
  transactions: () => ['transactions'] as const,
  // Hors de ['transactions'] à dessein, contrairement à periodSummary et categoryBreakdown : un budget n'est pas dérivé des transactions. L'y nicher ferait recharger les plafonds à chaque saisie de dépense.
  budgetsAll: () => ['budgets'] as const,
  // La racine sert aux invalidations, la clé par groupe aux lectures — invalider la racine touche tous les groupes en cache, ce qui est voulu, parce que la mutation peut avoir été déclenchée sous un autre groupe que celui actif quand la réponse arrive.
  budgets: (groupId: string) => ['budgets', groupId] as const,
  // `from` fait partie de la clé, comme pour periodSummary : la liste du tableau de bord est bornée à la période, donc une bascule de période doit ouvrir une entrée neuve plutôt que réutiliser celle de la précédente.
  recentTransactions: (groupId: string, from: string) =>
    ['transactions', 'recent', groupId, from] as const,
  transaction: (id: string) => ['transactions', 'detail', id] as const,
  // Imbriquée sous ['transactions'] à dessein : le résumé est dérivé des transactions, et les mutations comme le Realtime invalident déjà ce préfixe. Le solde se rafraîchit donc seul, sans que use-transaction-mutations ni use-transactions-realtime aient à connaître son existence.
  periodSummary: (groupId: string, from: string) =>
    ['transactions', 'summary', groupId, from] as const,
  // Imbriquée sous ['transactions'] comme periodSummary, pour la même raison : dérivée des transactions, donc invalidée par le préfixe déjà en place. `to` fait partie de la clé depuis les budgets hebdomadaires : une semaine qui commence le même jour que la période aurait sinon partagé son entrée.
  categoryBreakdown: (groupId: string, from: string, to: string) =>
    ['transactions', 'breakdown', groupId, from, to] as const,
  // Imbriquée sous ['transactions'] comme ses voisines : elle hérite des invalidations posées par les mutations et le Realtime. Les filtres entrent dans la clé, donc changer de filtre ouvre une entrée neuve au lieu d'écraser la précédente — revenir à un filtre déjà vu est immédiat.
  transactionHistory: (groupId: string, filters: TransactionFilters) =>
    ['transactions', 'history', groupId, filters] as const,
  // Dérivées des transactions, donc sous le même préfixe : une saisie, une modification ou un événement Realtime les rafraîchit sans qu'aucune mutation ait à les connaître.
  dailyTotals: (groupId: string, filters: TransactionFilters) =>
    ['transactions', 'daily', groupId, filters] as const,
  frequentAmounts: (groupId: string, type: string) =>
    ['transactions', 'frequent', groupId, type] as const,
  // Sous ['transactions'] parce que la dépense en vient, comme categoryBreakdown. Les plafonds, eux, n'y sont pas : les mutations et le Realtime des budgets invalident en plus la racine budgetTotalsAll(), qui n'existe que pour ça — invalider ['transactions'] rechargerait tout l'historique pour un plafond.
  budgetTotalsAll: () => ['transactions', 'budgetTotals'] as const,
  budgetTotals: (groupId: string, from: string) =>
    ['transactions', 'budgetTotals', groupId, from] as const,
  // Sous ['transactions'] : ce qui reste dû se calcule à partir des mouvements, qui sont des opérations. Une saisie, une suppression en cascade ou un événement Realtime sur transactions les rafraîchit sans qu'aucune mutation ait à les connaître.
  debts: (groupId: string) => ['transactions', 'debts', groupId] as const,
  debtTotals: (groupId: string) => ['transactions', 'debtTotals', groupId] as const,
  // Hors de ['transactions'] : un modèle récurrent n'est pas dérivé des opérations, et le nicher le rechargerait à chaque saisie. Racine réservée aux invalidations, comme budgetsAll : une confirmation ou un événement Realtime peut arriver après un changement de groupe actif.
  recurringAll: () => ['recurring'] as const,
  recurring: (groupId: string) => ['recurring', groupId] as const,
  // Hors de ['transactions'] à dessein : le fil se consulte délibérément, se recharge à chaque ouverture et au geste « tirer pour rafraîchir ». Aucune invalidation n'a besoin de l'atteindre, et le nicher le ferait recharger à chaque saisie pour rien.
  activity: (groupId: string) => ['activity', groupId] as const,
  // Portée personnelle, pas de groupe : une seule clé, sans le couple racine/groupe des budgets. La policy ne renvoie déjà que les objectifs de l'appelant, et usePersistedQueryCache() vide tout le cache au changement de compte — il n'existe pas d'équivalent « objectif actif » dont une invalidation devrait se méfier.
  savingsGoals: () => ['savingsGoals'] as const,
  // Sous ['savingsGoals'] : un versement, une création ou une suppression invalident déjà ce préfixe, et les totaux suivent sans qu'aucune mutation les connaisse. `today` dans la clé : le rythme change avec le mois.
  savingsOverview: (today: string) => ['savingsGoals', 'overview', today] as const,
  // Un groupe à la fois, comme `activity` : rien de ce qui invalide `['transactions']`/`['budgets']` ne concerne les membres ou les invitations, pas de nichage sous ces préfixes.
  // Racine réservée aux invalidations, comme budgetsAll : un événement Realtime sur les adhésions ne dit pas de quel groupe il s'agit (un DELETE ne porte que l'id).
  groupMembersAll: () => ['groupMembers'] as const,
  groupMembers: (groupId: string) => ['groupMembers', groupId] as const,
  groupInvitation: (groupId: string) => ['groupInvitation', groupId] as const,
  // Clés plates, sans groupe, comme savingsGoals : le profil et les blocages de suppression appartiennent à l'utilisateur, et usePersistedQueryCache() est la seule frontière qui compte.
  profile: () => ['profile'] as const,
  deletionBlockers: () => ['deletionBlockers'] as const,
};

/**
 * Clés des écritures qui patientent hors ligne. Seules ces mutations ont des valeurs par défaut enregistrées sur le QueryClient (`registerTransactionMutationDefaults`) : c'est ce qui permet de rejouer, après un redémarrage de l'app, une saisie restée en file — la fonction ne se sérialise pas, seule la clé survit sur le disque et la retrouve.
 *
 * Espace de noms distinct des clés de requête : `['transactionWrites']` ne recoupe rien dans `queryKeys`, et la racine sert à compter ce qui reste en attente.
 */
export const mutationKeys = {
  transactionWrites: () => ['transactionWrites'] as const,
  createTransaction: () => ['transactionWrites', 'create'] as const,
  updateTransaction: () => ['transactionWrites', 'update'] as const,
  deleteTransaction: () => ['transactionWrites', 'delete'] as const,
};
