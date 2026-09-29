import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { authErrorMessage } from '@/lib/auth-errors';

describe('authErrorMessage', () => {
  it('traduit un code connu', () => {
    expect(authErrorMessage(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toBe(
      'Email ou mot de passe incorrect.'
    );
  });

  it('dit « Pas de connexion » quand la requête n’a pas eu de réponse', () => {
    // Ce que lève auth-js quand fetch échoue : réseau coupé, ou limite de temps de fetch-with-timeout.ts.
    expect(authErrorMessage(new AuthRetryableFetchError('Network request timed out', 0))).toBe(
      'Pas de connexion. Vérifiez votre réseau.'
    );
  });

  it('traduit l’échec d’envoi d’un e-mail par le serveur', () => {
    // Relevé dans les journaux d'Auth : le serveur SMTP refusait l'authentification.
    expect(
      authErrorMessage(new AuthApiError('Error sending recovery email', 500, 'unexpected_failure'))
    ).toBe('Le service n’a pas pu répondre. Réessayez dans quelques minutes.');
  });

  it('traite toute autre panne du serveur de la même façon', () => {
    expect(authErrorMessage(new AuthApiError('Bad gateway', 502, undefined))).toBe(
      'Le service n’a pas pu répondre. Réessayez dans quelques minutes.'
    );
  });

  it('garde le repli générique pour un refus inconnu', () => {
    expect(authErrorMessage(new AuthApiError('Nope', 422, 'something_new'))).toBe(
      "Échec de l'authentification (something_new)."
    );
  });
});
