/**
 * Code d'invitation affiché : « a3f09b12 » → « A3F0-9B12 ».
 *
 * La base génère huit caractères hexadécimaux en minuscules (`encode(gen_random_bytes(4), 'hex')`). Les couper en deux groupes de quatre, en majuscules, les rend lisibles à voix haute et recopiables sans se perdre au milieu. L'affichage seul change : c'est `normalizeInvitationCode` qui ramène la saisie à la forme stockée.
 */
export function formatInvitationCode(code: string): string {
  const upper = code.toUpperCase();
  return upper.length === 8 ? `${upper.slice(0, 4)}-${upper.slice(4)}` : upper;
}

/**
 * Ramène un code saisi à la forme stockée : minuscules, sans tiret ni espace.
 *
 * Indispensable dès que l'affichage diffère du stockage : `join_group_with_code()` compare le texte exact, et un invité qui recopie « A3F0-9B12 » tel qu'il le voit serait refusé comme porteur d'un code introuvable.
 */
export function normalizeInvitationCode(input: string): string {
  return input.toLowerCase().replace(/[\s-]/g, '');
}

/** Longueur d'un code d'invitation : quatre octets aléatoires, en hexadécimal. */
export const INVITATION_CODE_LENGTH = 8;

/**
 * Filtre la saisie des cases du code : ne garde que les caractères hexadécimaux, en minuscules, et coupe à huit.
 *
 * Tout autre caractère est ignoré plutôt que refusé : un code collé tel qu'il s'affiche chez le propriétaire (« A3F0-9B12 », parfois entouré d'espaces ou suivi d'un retour à la ligne) remplit ainsi les huit cases d'un coup. Le champ ne porte pas de `maxLength` pour la même raison : il couperait le collage à huit caractères tiret compris, avant ce filtre.
 */
export function sanitizeInvitationCodeInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '')
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
