import { declaredUsage, isOnboardingPending } from '@/lib/onboarding';

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
