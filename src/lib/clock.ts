/**
 * Décalage entre l'horloge du téléphone et celle du serveur, mesuré sur le jeton de session.
 *
 * L'app date les opérations, calcule les périodes et les échéances sur l'appareil, parce que le serveur est en UTC. Une horloge fausse — batterie retirée, réglage manuel, téléphone sans heure réseau — date donc les saisies du mauvais jour, propose une récurrence trop tôt, et fait croire valide un jeton expiré (erreurs 401). Rien ne le signalait.
 *
 * Le jeton d'accès porte l'instant où le serveur l'a émis (`iat`). Juste après une connexion ou un rafraîchissement, l'écart entre cet instant et l'heure du téléphone est le décalage de son horloge, au temps de la requête près.
 */

/** Au-delà, l'heure du téléphone est jugée fausse. Assez large pour absorber une requête lente sur un réseau 2G. */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60_000;

/** Instant d'émission du jeton, en millisecondes, ou `null` s'il est illisible. */
export function tokenIssuedAtMs(accessToken: string): number | null {
  const payload = accessToken.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const { iat } = JSON.parse(atob(padded)) as { iat?: unknown };
    return typeof iat === 'number' && Number.isFinite(iat) ? iat * 1000 : null;
  } catch {
    return null;
  }
}

/** Avance (positive) ou retard (négatif) de l'horloge du téléphone sur celle du serveur, pour un jeton reçu à l'instant `now`. */
export function clockSkewMs(accessToken: string, now: number): number | null {
  const issuedAt = tokenIssuedAtMs(accessToken);
  return issuedAt === null ? null : now - issuedAt;
}

export function isClockWrong(skewMs: number | null): boolean {
  return skewMs !== null && Math.abs(skewMs) > CLOCK_SKEW_TOLERANCE_MS;
}

/** « 2 h », « 35 min », « 3 jours » : l'ordre de grandeur suffit à faire comprendre qu'il faut corriger l'heure. */
export function formatSkew(skewMs: number): string {
  const minutes = Math.round(Math.abs(skewMs) / 60_000);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours} h`;
  }
  return `${Math.round(hours / 24)} jours`;
}
