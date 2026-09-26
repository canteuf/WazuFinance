import { INVITATION_CODE_LENGTH, sanitizeInvitationCodeInput } from '@/lib/invitation-code';

/**
 * Liens d'invitation : `wazufinance://join/CODE` ouvre l'app, et la page web de secours (`docs/join/index.html`, publiée par GitHub Pages) le propose à qui touche le lien https dans WhatsApp, où un schéma d'app n'est pas cliquable.
 */

/** Page de secours, publiée depuis le dossier `docs/` du dépôt. */
export const JOIN_PAGE_URL = 'https://canteuf.github.io/WazuFinance/join/';

/** Le lien partagé, cliquable partout : la page ouvre l'app, ou mène au Play Store. */
export function invitationLink(code: string): string {
  return `${JOIN_PAGE_URL}?code=${encodeURIComponent(code)}`;
}

/**
 * Le code d'invitation porté par un chemin entrant (`join/7KQ2M9XA`, `/join/7KQ2-M9XA`, ou l'URL complète), ou `null` si ce n'est pas un lien d'invitation valide.
 *
 * Le code passe par le même filtre que la saisie à la main : un lien abîmé par une messagerie (tiret, minuscules) reste reconnu, et un lien trafiqué ne fait entrer dans l'écran que des symboles de l'alphabet.
 */
export function joinCodeFromPath(path: string): string | null {
  const match = path.match(/(?:^|\/)join\/([^/?#]+)/i);
  if (!match) {
    return null;
  }
  let raw: string;
  try {
    raw = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  const code = sanitizeInvitationCodeInput(raw);
  return code.length === INVITATION_CODE_LENGTH ? code : null;
}
