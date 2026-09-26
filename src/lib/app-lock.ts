/**
 * Règles du verrouillage de l'app, sans rien de natif : ce que Jest vérifie.
 *
 * Le stockage (SecureStore) est dans `app-lock-storage.ts`, l'état et l'écran dans `AppLockProvider`.
 */

export const PIN_LENGTH = 4;

/** Temps passé hors de l'app au-delà duquel le code est redemandé. Revenir de WhatsApp pour copier un montant ne doit rien redemander ; un téléphone laissé sur la table, si. */
export const LOCK_AFTER_MS = 60_000;

/** Au-delà de ce nombre d'échecs consécutifs, l'app se déconnecte : le compte reste protégé par son mot de passe, et rien n'est lisible sur le téléphone sans lui. */
export const MAX_FAILURES = 10;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

/** Refuse les codes que n'importe qui essaierait en premier. */
export function isGuessablePin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) {
    return true;
  }
  const digits = pin.split('').map(Number);
  const steps = digits.slice(1).map((digit, index) => digit - digits[index]);
  return steps.every((step) => step === 1) || steps.every((step) => step === -1);
}

export function shouldLockOnReturn(backgroundAt: number | null, now: number): boolean {
  return backgroundAt !== null && now - backgroundAt >= LOCK_AFTER_MS;
}

/**
 * Attente imposée après `failures` échecs consécutifs : rien pour les quatre premiers (une faute de frappe), puis 30 s, 1 min, 5 min, et 15 min ensuite.
 *
 * Avec 10 000 codes possibles et une déconnexion au dixième échec, deviner un code tient de la chance, pas de la patience.
 */
export function lockoutDelayMs(failures: number): number {
  if (failures < 5) {
    return 0;
  }
  const delays = [30_000, 60_000, 5 * 60_000];
  return delays[failures - 5] ?? 15 * 60_000;
}

/** Millisecondes restantes avant le prochain essai autorisé ; 0 quand on peut saisir. */
export function lockoutRemainingMs(failures: number, lastFailureAt: number | null, now: number): number {
  if (lastFailureAt === null) {
    return 0;
  }
  return Math.max(0, lastFailureAt + lockoutDelayMs(failures) - now);
}

/** « 30 s », « 1 min », « 5 min » : arrondi au-dessus, pour ne jamais annoncer moins que l'attente réelle. */
export function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) {
    return `${seconds} s`;
  }
  return `${Math.ceil(seconds / 60)} min`;
}
