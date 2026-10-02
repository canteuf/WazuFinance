import type { WalletKind } from '@/types/database';

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

/**
 * Portefeuilles proposés à l'accueil, décochés : rien n'est créé sans que la personne l'ait choisi.
 *
 * Les opérateurs du Cameroun (Orange Money, MTN MoMo) et du Gabon (Airtel Money, Moov Money), plus Wave et la carte bancaire : l'app ne connaît pas le pays, alors elle les propose tous, chaque nom étant assez connu pour être ignoré d'un coup d'œil par qui ne l'utilise pas. « Autre portefeuille » couvre le reste (service de transfert, bureau de change, opérateur absent de la liste) sans allonger la liste : on le renomme ensuite depuis l'écran du portefeuille. Un nom sert aussi de clé à l'identifiant tiré pour sa création (voir OnboardingGate) : deux entrées ne portent jamais le même.
 */
export const SUGGESTED_WALLETS: readonly { name: string; kind: WalletKind; icon: string }[] = [
  { name: 'Orange Money', kind: 'mobile_money', icon: 'cellphone' },
  { name: 'MTN MoMo', kind: 'mobile_money', icon: 'cellphone' },
  { name: 'Airtel Money', kind: 'mobile_money', icon: 'cellphone' },
  { name: 'Moov Money', kind: 'mobile_money', icon: 'cellphone' },
  { name: 'Wave', kind: 'mobile_money', icon: 'cellphone' },
  { name: 'Carte bancaire', kind: 'bank', icon: 'credit-card-outline' },
  { name: 'Autre portefeuille', kind: 'other', icon: 'wallet-outline' },
];
