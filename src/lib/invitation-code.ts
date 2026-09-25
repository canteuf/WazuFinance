/**
 * Symboles d'un code d'invitation : les chiffres 2 à 9 et les lettres sans I ni O, qui se confondent avec 1 et 0 à la lecture ou à la dictée. Même alphabet que `generate_invitation_code()` en base (migration harden_group_access).
 */
export const INVITATION_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Longueur d'un code d'invitation. */
export const INVITATION_CODE_LENGTH = 8;

/**
 * Code d'invitation affiché : « 7KQ2M9XA » → « 7KQ2-M9XA ».
 *
 * Deux groupes de quatre le rendent lisible à voix haute et recopiable sans se perdre au milieu. L'affichage seul change : `normalizeInvitationCode` ramène la saisie à la forme stockée.
 */
export function formatInvitationCode(code: string): string {
  const upper = code.toUpperCase();
  return upper.length === INVITATION_CODE_LENGTH ? `${upper.slice(0, 4)}-${upper.slice(4)}` : upper;
}

/**
 * Ramène un code saisi à la forme stockée : majuscules, sans tiret ni espace. `join_group_with_code()` fait la même normalisation en base ; la faire aussi ici garde l'état de l'écran identique à ce qui sera comparé.
 */
export function normalizeInvitationCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/**
 * Filtre la saisie des cases du code : ne garde que les symboles de l'alphabet, en majuscules, et coupe à huit.
 *
 * Tout autre caractère est ignoré plutôt que refusé : un code collé tel qu'il s'affiche chez le propriétaire (« 7KQ2-M9XA », parfois entouré d'espaces ou suivi d'un retour à la ligne) remplit ainsi les huit cases d'un coup. Le champ ne porte pas de `maxLength` pour la même raison : il couperait le collage à huit caractères tiret compris, avant ce filtre.
 */
export function sanitizeInvitationCodeInput(input: string): string {
  return [...input.toUpperCase()]
    .filter((char) => INVITATION_CODE_ALPHABET.includes(char))
    .join('')
    .slice(0, INVITATION_CODE_LENGTH);
}

/**
 * Jours pleins restants avant l'expiration, arrondis au-dessus : une invitation qui expire dans 30 heures « expire dans 2 jours », pas dans 1, qui laisserait croire qu'elle ne passera pas le lendemain soir.
 *
 * Zéro une fois expirée, jamais négatif.
 */
export function daysUntilExpiry(expiresAt: string, now: Date = new Date()): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const remaining = new Date(expiresAt).getTime() - now.getTime();
  return Math.max(Math.ceil(remaining / msPerDay), 0);
}
