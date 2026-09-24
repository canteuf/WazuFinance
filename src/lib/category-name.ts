/**
 * Nom d'une catégorie personnalisée.
 *
 * Contrôle côté client pour un retour immédiat ; la contrainte `categories_name_format` et le trigger `categories_guard_homonym` (20260924000100_custom_categories.sql) font autorité.
 */

/** Borne de la contrainte en base : au-delà, le nom ne tient plus dans une tuile de la grille. */
export const CATEGORY_NAME_MAX_LENGTH = 30;

/** Rogne les bords et ramène les espaces intérieurs à une seule : « Sport  en salle » et « Sport en salle » ne doivent pas faire deux tuiles. */
export function normalizeCategoryName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Message d'erreur pour un nom déjà normalisé, ou `undefined` s'il est acceptable.
 *
 * `existing` : les catégories du même type que le groupe voit déjà, par défaut comprises — la base refuse aussi l'homonyme d'une catégorie par défaut. La comparaison ignore la casse, comme l'index `categories_unique_group_name`.
 */
export function validateCategoryName(
  name: string,
  existing: readonly { name: string }[]
): string | undefined {
  if (name === '') {
    return 'Donnez un nom à la catégorie.';
  }
  // En points de code, comme char_length() côté Postgres : `.length` compterait deux unités pour un emoji.
  if ([...name].length > CATEGORY_NAME_MAX_LENGTH) {
    return `${CATEGORY_NAME_MAX_LENGTH} caractères au plus.`;
  }
  const lowered = name.toLowerCase();
  if (existing.some((category) => category.name.toLowerCase() === lowered)) {
    // Même texte que le trigger, pour que l'utilisateur lise la même chose que le contrôle ait lieu ici ou en base.
    return 'Une catégorie porte déjà ce nom.';
  }
  return undefined;
}
