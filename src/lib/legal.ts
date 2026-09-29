/**
 * Pages légales publiées par GitHub Pages depuis `docs/legal/`, et version des textes que l'utilisateur accepte.
 *
 * L'acceptation est rangée dans les métadonnées du compte Supabase (`user_metadata.terms_version`) : à l'inscription, par `signUp`, qui l'écrit dans la même requête que le compte ; pour un compte plus ancien ou après un changement des textes, par `acceptTerms()`. Aucune table ni migration : Auth date lui-même la création et chaque mise à jour du compte.
 */

const LEGAL_BASE_URL = 'https://canteuf.github.io/WazuFinance/legal/';

export const LEGAL_URLS = {
  terms: `${LEGAL_BASE_URL}cgu.html`,
  privacy: `${LEGAL_BASE_URL}confidentialite.html`,
  accountDeletion: `${LEGAL_BASE_URL}suppression.html`,
} as const;

/**
 * Date d'entrée en vigueur des CGU et de la politique de confidentialité, telle qu'elle figure en tête des deux pages.
 *
 * La changer quand un des textes change de manière importante : chaque compte qui a accepté une version antérieure revoit alors l'écran d'acceptation à sa prochaine ouverture, comme la politique s'y engage (section 11).
 */
export const TERMS_VERSION = '2026-10-01';

/** Vrai quand le compte a accepté la version en vigueur. `metadata` est `session.user.user_metadata`, que Supabase type en `any`. */
export function hasAcceptedCurrentTerms(metadata: unknown): boolean {
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    (metadata as { terms_version?: unknown }).terms_version === TERMS_VERSION
  );
}
