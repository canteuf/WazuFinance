/**
 * Accueil d'un nouveau compte : l'usage qu'il déclare et l'état de l'accueil, rangés dans `user_metadata` comme l'acceptation des CGU (voir legal.ts).
 *
 * Seule une inscription faite par cette version porte `onboarding_pending: true` : les comptes plus anciens, qui utilisent déjà l'app, ne voient jamais l'accueil. Le terminer, ou le passer, le remet à `false`.
 */

export type Usage = 'personal' | 'family' | 'commerce' | 'tontine';

export const USAGES: readonly { id: Usage; label: string; hint: string; icon: string }[] = [
  { id: 'personal', label: 'Mon budget', hint: 'Suivre mes dépenses et mes revenus', icon: 'account-outline' },
  { id: 'family', label: 'En famille', hint: 'Tenir un budget commun à plusieurs', icon: 'home-heart' },
  { id: 'commerce', label: 'Mon commerce', hint: 'Ventes, stock, ventes à crédit', icon: 'storefront-outline' },
  { id: 'tontine', label: 'Ma tontine', hint: 'Tenir la caisse et la montrer aux membres', icon: 'account-group-outline' },
];

/** Vrai quand l'accueil reste à faire : seulement pour un compte créé par cette version, qui ne l'a ni terminé ni passé. */
export function isOnboardingPending(metadata: unknown): boolean {
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    (metadata as { onboarding_pending?: unknown }).onboarding_pending === true
  );
}

/** L'usage déclaré à l'accueil, ou `null` : compte plus ancien, ou accueil passé sans répondre. */
export function declaredUsage(metadata: unknown): Usage | null {
  const value =
    typeof metadata === 'object' && metadata !== null ? (metadata as { usage?: unknown }).usage : null;
  return value === 'personal' || value === 'family' || value === 'commerce' || value === 'tontine'
    ? value
    : null;
}

/** Portefeuilles mobile money proposés à l'accueil, décochés : rien n'est créé sans que la personne l'ait choisi. */
export const SUGGESTED_WALLETS = ['Orange Money', 'MTN MoMo', 'Wave'] as const;
