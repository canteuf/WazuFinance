/**
 * Validation des formulaires d'authentification.
 *
 * Contrôle côté client pour un retour immédiat ; la vérification qui fait
 * autorité reste celle de Supabase Auth.
 */

// Volontairement permissif : le seul test fiable d'une adresse est l'email de
// confirmation. On rejette juste les fautes de frappe évidentes.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(email: string): string | undefined {
  const value = email.trim();
  if (!value) {
    return 'Email requis.';
  }
  if (!EMAIL_PATTERN.test(value)) {
    return 'Format d’email invalide.';
  }
  return undefined;
}

export function validatePassword(password: string): string | undefined {
  if (!password) {
    return 'Mot de passe requis.';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  return undefined;
}

export function validateDisplayName(displayName: string): string | undefined {
  const value = displayName.trim();
  if (!value) {
    return 'Nom requis.';
  }
  if (value.length < 2) {
    return 'Au moins 2 caractères.';
  }
  return undefined;
}
