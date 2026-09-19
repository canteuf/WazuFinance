/**
 * Disposition de la grille de catégories, d'après la maquette « Nouvelle écriture » : deux tuiles en tête, puis des rangées de trois, toutes de même largeur et alignées en colonnes.
 *
 * Pur et sans React, pour que les seuils soient couverts par Jest plutôt qu'enfouis dans le JSX. La largeur d'un libellé n'est pas mesurable avant le rendu, d'où une estimation par nombre de caractères. Seul le mot le plus long compte : un libellé de plusieurs mots (« Autres revenus ») passe à la ligne entre deux mots, jamais au milieu d'un seul.
 */

export const LABEL_FONT_SIZE = 15;
export const TILE_PADDING_H = 8;
export const TILE_INNER_GAP = 6;
export const ICON_SIZE = 18;

/** Largeur moyenne d'un caractère rapportée à la taille de police, un peu au-dessus de la moyenne réelle d'une sans-serif demi-grasse en minuscules : mieux vaut passer à moins de colonnes un peu trop tôt que couper un nom. */
const CHAR_WIDTH_RATIO = 0.55;

export type CategoryGridRow = {
  /** Index dans la liste d'origine, `null` pour une case vide qui garde l'alignement des colonnes sur la dernière rangée. */
  slots: (number | null)[];
  /** Icône au-dessus du libellé plutôt qu'à sa gauche, quand la tuile est trop étroite pour les deux côte à côte. Décidé par rangée, pas par tuile : dans une même rangée les tuiles gardent la même forme et la même hauteur. */
  iconAbove: boolean;
};

type Input = {
  labels: string[];
  /** Largeur disponible pour la grille, en points. */
  width: number;
  gap: number;
  fontScale: number;
};

function longestWord(label: string): number {
  return Math.max(0, ...label.split(/\s+/).map((word) => word.length));
}

export function categoryGridLayout({ labels, width, gap, fontScale }: Input): CategoryGridRow[] {
  const textWidth = (chars: number) => chars * LABEL_FONT_SIZE * CHAR_WIDTH_RATIO * fontScale;
  const iconWidth = ICON_SIZE * Math.min(fontScale, 1.5);
  const tileWidth = (columns: number) => (width - gap * (columns - 1)) / columns;

  const fitsStacked = (columns: number, chars: number) =>
    tileWidth(columns) >= textWidth(chars) + 2 * TILE_PADDING_H;
  const fitsInline = (columns: number, chars: number) =>
    tileWidth(columns) >= textWidth(chars) + iconWidth + TILE_INNER_GAP + 2 * TILE_PADDING_H;

  // Le nombre de colonnes vaut pour toute la grille : des colonnes qui changeraient d'une rangée à l'autre au-delà de la tête casseraient l'alignement.
  const longest = Math.max(0, ...labels.map(longestWord));
  const columns = fitsStacked(3, longest) ? 3 : fitsStacked(2, longest) ? 2 : 1;
  // Deux en tête seulement quand le reste passe à trois : c'est ce contraste qui donne sa forme à la maquette. À deux colonnes ou moins, la tête suit le reste.
  const headColumns = Math.min(2, columns);

  const rows: CategoryGridRow[] = [];
  let index = 0;
  let rowColumns = headColumns;
  while (index < labels.length) {
    const slots: (number | null)[] = [];
    for (let slot = 0; slot < rowColumns; slot++) {
      slots.push(index < labels.length ? index : null);
      index++;
    }
    const rowLongest = Math.max(
      0,
      ...slots.map((slot) => (slot === null ? 0 : longestWord(labels[slot])))
    );
    rows.push({ slots, iconAbove: !fitsInline(rowColumns, rowLongest) });
    rowColumns = columns;
  }

  return rows;
}
