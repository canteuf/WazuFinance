import { AuthError } from '@supabase/supabase-js';

/**
 * Messages d'erreur d'authentification en français.
 *
 * Supabase renvoie des messages en anglais destinés au développeur. On mappe les codes stables plutôt que le texte, qui peut changer d'une version à l'autre.
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  email_not_confirmed: 'Confirmez votre email avant de vous connecter.',
  user_already_exists: 'Un compte existe déjà avec cet email.',
  email_exists: 'Un compte existe déjà avec cet email.',
  weak_password: 'Mot de passe trop faible : utilisez au moins 8 caractères.',
  over_email_send_rate_limit: 'Trop de tentatives. Réessayez dans quelques minutes.',
  over_request_rate_limit: 'Trop de tentatives. Réessayez dans quelques minutes.',
  validation_failed: 'Vérifiez les informations saisies.',
  signup_disabled: "Les inscriptions sont désactivées sur ce projet.",
  same_password: 'Le nouveau mot de passe doit être différent de l’actuel.',
  // Supabase renvoie ce même code pour un code faux et pour un code expiré.
  otp_expired: 'Code invalide ou expiré. Demandez-en un nouveau.',
  // Panne côté serveur, par exemple l'envoi d'un e-mail refusé par le serveur SMTP : l'utilisateur n'y peut rien, sauf réessayer.
  unexpected_failure: 'Le service n’a pas pu répondre. Réessayez dans quelques minutes.',
};

/**
 * Le mot de passe actuel, redemandé avant une action sensible, est faux.
 *
 * Erreur dédiée plutôt que `invalid_credentials` : son message générique, « Email ou mot de passe incorrect », serait trompeur ici, où l'email n'est pas saisi. L'écran l'affiche sous le champ concerné.
 */
export class CurrentPasswordError extends Error {
  constructor() {
    super('Mot de passe actuel incorrect.');
    this.name = 'CurrentPasswordError';
  }
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    const known = error.code ? MESSAGES[error.code] : undefined;
    if (known) {
      return known;
    }
    // auth-js range toute requête sans réponse (réseau coupé, limite de temps de fetch-with-timeout.ts) dans une AuthRetryableFetchError de statut 0, sans code.
    if (error.name === 'AuthRetryableFetchError' && error.status === 0) {
      return 'Pas de connexion. Vérifiez votre réseau.';
    }
    // Toute autre panne du serveur : même message, plutôt qu'un code HTTP que l'utilisateur ne peut pas interpréter.
    if (error.status !== undefined && error.status >= 500) {
      return MESSAGES.unexpected_failure;
    }
    // Pas de code exploitable : on retombe sur une formulation générique plutôt que d'afficher un message anglais à l'utilisateur.
    return `Échec de l'authentification (${error.code ?? error.status ?? 'inconnu'}).`;
  }

  if (error instanceof Error && error.message.includes('Network request failed')) {
    return 'Pas de connexion. Vérifiez votre réseau.';
  }

  return 'Une erreur inattendue est survenue.';
}
