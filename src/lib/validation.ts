/**
 * Validation des formulaires d'authentification.
 *
 * Contrôle côté client pour un retour immédiat ; la vérification qui fait autorité reste celle de Supabase Auth.
 */

// Volontairement permissif : le seul test fiable d'une adresse est l'email de confirmation. On rejette juste les fautes de frappe évidentes.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

/** Longueurs saisissables dans l'app. La base en impose de plus larges (migration 20260929000100) : elle n'arrête que les appels directs à l'API, jamais une saisie faite ici. */
export const DISPLAY_NAME_MAX_LENGTH = 40;
export const GROUP_NAME_MAX_LENGTH = 40;
/** Un versement d'épargne prend le nom de l'objectif comme note d'opération : il doit tenir dans `NOTE_MAX_LENGTH`. */
export const GOAL_NAME_MAX_LENGTH = 60;
/** Comme la note d'une dette, d'un transfert ou d'une récurrence : une opération répétée passe sa note à la récurrence, limitée à 120 en base. */
export const NOTE_MAX_LENGTH = 120;

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

/** Le code de réinitialisation compte 6 chiffres par défaut ; un projet Supabase peut le régler jusqu'à 10. */
const RECOVERY_CODE_PATTERN = /^\d{6,10}$/;

export function validateRecoveryCode(code: string): string | undefined {
  const value = code.trim();
  if (!value) {
    return 'Code requis.';
  }
  if (!RECOVERY_CODE_PATTERN.test(value)) {
    return 'Saisissez les chiffres du code reçu par email.';
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
  if ([...value].length > DISPLAY_NAME_MAX_LENGTH) {
    return `${DISPLAY_NAME_MAX_LENGTH} caractères au plus.`;
  }
  return undefined;
}
