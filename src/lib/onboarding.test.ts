import { declaredUsage, isOnboardingPending, SUGGESTED_WALLETS } from '@/lib/onboarding';

describe('isOnboardingPending', () => {
  it('vrai pour un compte créé par cette version, accueil pas encore fait', () => {
    expect(isOnboardingPending({ display_name: 'Awa', onboarding_pending: true })).toBe(true);
  });

  it('faux pour un compte plus ancien, qui utilise déjà l’app', () => {
    // Pas de clé du tout : ces comptes ne doivent jamais voir l'accueil.
    expect(isOnboardingPending({ display_name: 'Awa' })).toBe(false);
  });

  it('faux une fois l’accueil terminé ou passé', () => {
    expect(isOnboardingPending({ onboarding_pending: false })).toBe(false);
  });

  it('faux pour des métadonnées absentes ou mal formées', () => {
    expect(isOnboardingPending(undefined)).toBe(false);
    expect(isOnboardingPending(null)).toBe(false);
    expect(isOnboardingPending({ onboarding_pending: 'true' })).toBe(false);
  });
});

describe('declaredUsage', () => {
  it('rend l’usage déclaré', () => {
    expect(declaredUsage({ usage: 'tontine' })).toBe('tontine');
  });

  it('ignore une valeur inconnue plutôt que de la faire confiance', () => {
    expect(declaredUsage({ usage: 'banque' })).toBeNull();
    expect(declaredUsage({})).toBeNull();
    expect(declaredUsage(undefined)).toBeNull();
  });
});

describe('SUGGESTED_WALLETS', () => {
  it('donne à chaque portefeuille un nom unique, qui sert de clé à son identifiant de création', () => {
    const names = SUGGESTED_WALLETS.map((wallet) => wallet.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('propose les opérateurs du Cameroun et du Gabon, et la carte comme portefeuille bancaire', () => {
    const names = SUGGESTED_WALLETS.map((wallet) => wallet.name);
    expect(names).toEqual(expect.arrayContaining(['Orange Money', 'MTN MoMo', 'Airtel Money', 'Moov Money']));
    expect(SUGGESTED_WALLETS.find((wallet) => wallet.name === 'Carte bancaire')?.kind).toBe('bank');
  });

  it('termine par un portefeuille générique pour ce que la liste ne nomme pas', () => {
    expect(SUGGESTED_WALLETS.at(-1)).toMatchObject({ name: 'Autre portefeuille', kind: 'other' });
  });
});
