/** Ce qu'il faut pour dessiner la pastille d'un membre. `avatar` est la valeur brute de `users.avatar`, pas un identifiant déjà validé. */
export type MemberIdentity = {
  name: string;
  avatar: string | null;
};

/**
 * Rejoint les deux tableaux parallèles de `group_overviews()` : les noms et les avatars, dans le même ordre.
 *
 * Un avatar absent devient `null`, que sa case soit vide ou que le tableau soit plus court : PostgREST rend les NULL d'un tableau tels quels, mais le type généré ne les connaît pas, et `undefined` n'a pas de sens dans `MemberIdentity`.
 */
export function pairMembers(names: string[], avatars: (string | null)[]): MemberIdentity[] {
  return names.map((name, index) => ({ name, avatar: avatars[index] ?? null }));
}

/**
 * Initiales d'un nom affiché, pour une pastille d'avatar : « Camille Martin » → « CM », « Bob » → « B ».
 *
 * Deux lettres au plus, prises aux deux premiers mots : au-delà, la pastille de 32 px ne les tient plus. `Array.from` et non un index sur la chaîne, pour qu'un prénom commençant par une lettre hors du plan de base Unicode ne soit pas coupé en deux moitiés illisibles.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toLocaleUpperCase('fr-FR');
}

/**
 * Indice de teinte stable pour une personne, dans une palette de `size` couleurs.
 *
 * Dérivé du nom et non de la position dans la liste : Camille garde la même couleur sur la liste des groupes et sur le détail, où elle n'occupe pas le même rang. Un hachage simple suffit, le seul but est la stabilité, pas la dispersion.
 */
export function toneIndex(name: string, size: number): number {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash % size;
}
