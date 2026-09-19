import { categoryGridLayout } from '@/lib/category-grid';

// Les dix catégories de dépense de la migration de seed, dans l'ordre alphabétique.
const EXPENSE = [
  'Abonnements',
  'Alimentation',
  'Divers',
  'Éducation',
  'Logement',
  'Loisirs',
  'Restaurants',
  'Santé',
  'Transport',
  'Vêtements',
];

// Largeur de la grille, l'écran moins deux marges de 24 : un grand téléphone Android de 412 pt, et un iPhone de 375 pt.
const PHONE = 364;
const SMALL_PHONE = 327;

const base = { gap: 8, fontScale: 1 };

describe('categoryGridLayout', () => {
  it('passe à deux colonnes sur un téléphone de 375 pt, où trois tuiles couperaient « Alimentation »', () => {
    const rows = categoryGridLayout({ ...base, labels: EXPENSE.slice(0, 5), width: SMALL_PHONE });
    expect(rows.map((row) => row.slots)).toEqual([
      [0, 1],
      [2, 3],
      [4, null],
    ]);
  });

  it('reproduit la maquette : deux en tête puis des rangées de trois', () => {
    const rows = categoryGridLayout({ ...base, labels: EXPENSE.slice(0, 8), width: PHONE });
    expect(rows.map((row) => row.slots)).toEqual([
      [0, 1],
      [2, 3, 4],
      [5, 6, 7],
    ]);
  });

  it('complète la dernière rangée de cases vides pour garder les colonnes alignées', () => {
    const rows = categoryGridLayout({ ...base, labels: EXPENSE, width: PHONE });
    expect(rows.at(-1)?.slots).toEqual([8, 9, null]);
  });

  it("garde l'icône à gauche dans la rangée de tête, plus large", () => {
    const rows = categoryGridLayout({ ...base, labels: EXPENSE, width: PHONE });
    expect(rows[0].iconAbove).toBe(false);
  });

  it("met l'icône au-dessus dans une rangée de trois trop étroite pour « Restaurants »", () => {
    const rows = categoryGridLayout({ ...base, labels: EXPENSE, width: PHONE });
    const restaurants = rows.find((row) => row.slots.includes(EXPENSE.indexOf('Restaurants')));
    expect(restaurants?.iconAbove).toBe(true);
  });

  it('coupe entre deux mots : « Autres revenus » ne compte que pour « revenus »', () => {
    const one = categoryGridLayout({ ...base, labels: ['Salaire', 'Autres revenus', 'Cadeau'], width: PHONE });
    const two = categoryGridLayout({ ...base, labels: ['Salaire', 'Autresrevenus', 'Cadeau'], width: PHONE });
    expect(one[0].iconAbove).toBe(false);
    expect(two[0].iconAbove).toBe(false);
    expect(one[1].slots).toEqual([2, null, null]);
  });

  it('passe à deux colonnes partout quand trois ne tiennent plus', () => {
    const rows = categoryGridLayout({ ...base, labels: EXPENSE.slice(0, 5), width: PHONE, fontScale: 1.4 });
    expect(rows.map((row) => row.slots)).toEqual([
      [0, 1],
      [2, 3],
      [4, null],
    ]);
  });

  it('passe à une colonne à très grande police', () => {
    const rows = categoryGridLayout({ ...base, labels: EXPENSE.slice(0, 2), width: PHONE, fontScale: 2.5 });
    expect(rows.map((row) => row.slots)).toEqual([[0], [1]]);
  });

  it('ne produit aucune rangée sans catégorie', () => {
    expect(categoryGridLayout({ ...base, labels: [], width: PHONE })).toEqual([]);
  });
});
