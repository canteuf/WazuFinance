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
};

export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    const known = error.code ? MESSAGES[error.code] : undefined;
    if (known) {
      return known;
    }
    // Pas de code exploitable : on retombe sur une formulation générique plutôt que d'afficher un message anglais à l'utilisateur.
    return `Échec de l'authentification (${error.code ?? error.status ?? 'inconnu'}).`;
  }

  if (error instanceof Error && error.message.includes('Network request failed')) {
    return 'Pas de connexion. Vérifiez votre réseau.';
  }

  return 'Une erreur inattendue est survenue.';
}
