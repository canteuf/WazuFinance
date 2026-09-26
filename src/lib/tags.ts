/**
 * Étiquettes d'une opération (« Argent de Jean », « Rentrée 2027 ») : les règles de saisie, sans rien de React, pour que Jest les vérifie.
 *
 * La contrainte transactions_tags_valid (migration real_usage) refuse ce que ces fonctions ne produisent jamais : plus de cinq étiquettes, plus de 30 caractères, une espace en bordure, deux fois la même à la casse près. Les appliquer ici évite qu'une saisie hors ligne ne soit refusée des heures plus tard.
 */

export const MAX_TAGS = 5;
export const MAX_TAG_LENGTH = 30;

/** Espaces rognées et resserrées, coupée à la longueur permise ; `null` quand il ne reste rien. */
export function normalizeTag(raw: string): string | null {
  const tag = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim();
  return tag === '' ? null : tag;
}

/**
 * Ajoute une étiquette à la liste, telle que la base l'accepte.
 *
 * Une étiquette déjà utilisée dans le groupe garde son écriture d'origine : taper « argent de jean » reprend « Argent de Jean », sinon le filtre de l'historique, qui cherche l'étiquette exacte, verrait deux étiquettes là où l'utilisateur n'en voit qu'une. Un doublon, ou une sixième étiquette, laisse la liste telle quelle.
 */
export function addTag(tags: string[], raw: string, known: string[] = []): string[] {
  const tag = normalizeTag(raw);
  if (tag === null || tags.length >= MAX_TAGS) {
    return tags;
  }
  const key = tag.toLocaleLowerCase('fr');
  if (tags.some((existing) => existing.toLocaleLowerCase('fr') === key)) {
    return tags;
  }
  const canonical = known.find((existing) => existing.toLocaleLowerCase('fr') === key) ?? tag;
  return [...tags, canonical];
}

/** Suggestions pour le texte en cours : les étiquettes du groupe pas encore choisies, celles qui commencent par le texte tapé d'abord. */
export function tagSuggestions(known: string[], chosen: string[], typed: string, limit = 6): string[] {
  const query = typed.trim().toLocaleLowerCase('fr');
  const taken = new Set(chosen.map((tag) => tag.toLocaleLowerCase('fr')));
  const available = known.filter((tag) => !taken.has(tag.toLocaleLowerCase('fr')));
  if (query === '') {
    return available.slice(0, limit);
  }
  const lower = (tag: string) => tag.toLocaleLowerCase('fr');
  const starts = available.filter((tag) => lower(tag).startsWith(query));
  const contains = available.filter((tag) => !lower(tag).startsWith(query) && lower(tag).includes(query));
  return [...starts, ...contains].slice(0, limit);
}
