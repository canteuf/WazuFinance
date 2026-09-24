import { iconGridLayout } from '@/lib/icon-grid';

describe('iconGridLayout', () => {
  const gap = 8;
  const minTile = 44;

  it('remplit exactement la largeur, sans vide à droite', () => {
    for (const width of [300, 330, 361.5, 390, 420]) {
      const { columns, tileSize } = iconGridLayout({ count: 18, width, gap, minTile });
      expect(columns * tileSize + (columns - 1) * gap).toBeCloseTo(width, 6);
    }
  });

  it('équilibre les rangées : 18 icônes sur 7 colonnes possibles font 3 × 6', () => {
    // 7 colonnes de 44 + 6 écarts de 8 = 356.
    expect(iconGridLayout({ count: 18, width: 360, gap, minTile }).columns).toBe(6);
  });

  it('dix icônes font deux rangées de cinq plutôt que 7 + 3', () => {
    expect(iconGridLayout({ count: 10, width: 360, gap, minTile }).columns).toBe(5);
  });

  it('ne descend jamais sous la taille minimale', () => {
    for (const width of [200, 280, 330, 390, 420]) {
      expect(iconGridLayout({ count: 18, width, gap, minTile }).tileSize).toBeGreaterThanOrEqual(
        minTile
      );
    }
  });

  it('garde une colonne sur une largeur trop étroite', () => {
    expect(iconGridLayout({ count: 18, width: 30, gap, minTile }).columns).toBe(1);
  });

  it('ne prend pas plus de colonnes que d’icônes', () => {
    expect(iconGridLayout({ count: 3, width: 400, gap, minTile }).columns).toBe(3);
  });
});
