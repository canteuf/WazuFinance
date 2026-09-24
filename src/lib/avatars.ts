/**
 * Avatars de profil : des images livrées avec l'app, choisies par identifiant.
 *
 * `users.avatar` stocke l'identifiant (`a01`…), jamais l'image : rien à téléverser, à héberger ni à modérer, et le même identifiant donne le même visage sur tous les appareils. Pas d'avatar choisi (`null`) veut dire « initiales », le comportement d'avant cette colonne.
 *
 * L'ordre de la liste est celui du sélecteur. Un identifiant ne se retire ni ne se modifie jamais : il est peut-être enregistré dans des profils. Les images sont produites par `scripts/gen-avatars.mjs`.
 */
export const AVATAR_IDS = [
  'a01',
  'a02',
  'a03',
  'a04',
  'a05',
  'a06',
  'a07',
  'a08',
  'a09',
  'a10',
  'a11',
  'a12',
  'a13',
  'a14',
  'a15',
  'a16',
  'a17',
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

/** Le motif de la contrainte `users_avatar_format` en base : la base n'énumère pas les identifiants, pour qu'en ajouter un ne demande pas de migration. */
export const AVATAR_ID_PATTERN = /^a[0-9]{2}$/;

const KNOWN: ReadonlySet<string> = new Set(AVATAR_IDS);

function isAvatarId(value: string): value is AvatarId {
  return KNOWN.has(value);
}

/**
 * Relit une valeur venue de la base.
 *
 * Tout identifiant inconnu — avatar ajouté par une version plus récente de l'app, valeur corrompue — retombe sur les initiales plutôt que sur une image cassée.
 */
export function parseAvatarId(value: string | null | undefined): AvatarId | null {
  return value != null && isAvatarId(value) ? value : null;
}
