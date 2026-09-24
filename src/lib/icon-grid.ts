/**
 * Disposition d'une grille d'icônes à choisir (catégorie personnalisée, objectif d'épargne).
 *
 * Des tuiles de taille fixe passées à la ligne par `flexWrap` laissaient un vide à droite de chaque rangée : la rangée s'arrête dès que la tuile suivante ne tient plus, et le reste de la largeur est perdu. Ici la taille découle de la largeur : les colonnes remplissent la rangée d'un bord à l'autre.
 *
 * Les rangées sont ensuite équilibrées : 18 icônes sur une largeur qui en permet 7 donneraient 7 + 7 + 4 ; trois rangées de 6 prennent la même hauteur et ne laissent pas de rangée à moitié vide.
 */
export type IconGridLayout = {
  columns: number;
  /** Côté d'une tuile carrée, en points. */
  tileSize: number;
};

export function iconGridLayout({
  count,
  width,
  gap,
  minTile,
}: {
  count: number;
  width: number;
  gap: number;
  /** Côté minimal d'une tuile : en dessous, la cible tactile devient trop petite. */
  minTile: number;
}): IconGridLayout {
  if (count <= 0 || width <= 0) {
    return { columns: 1, tileSize: minTile };
  }

  const maxColumns = Math.max(1, Math.min(count, Math.floor((width + gap) / (minTile + gap))));
  const rows = Math.ceil(count / maxColumns);
  const columns = Math.ceil(count / rows);
  // Pas d'arrondi : un plancher laisserait jusqu'à un point par colonne de vide à droite, et React Native pose très bien des tailles fractionnaires.
  const tileSize = (width - gap * (columns - 1)) / columns;

  return { columns, tileSize };
}
