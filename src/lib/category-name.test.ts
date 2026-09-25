import {
  CATEGORY_NAME_MAX_LENGTH,
  hideShadowedDefaults,
  normalizeCategoryName,
  validateCategoryName,
} from '@/lib/category-name';

describe('normalizeCategoryName', () => {
  it('rogne les bords', () => {
    expect(normalizeCategoryName('  Animaux ')).toBe('Animaux');
  });

  it('ramène les espaces intérieurs à une seule', () => {
    expect(normalizeCategoryName('Sport \t en   salle')).toBe('Sport en salle');
  });

  it('rend une chaîne vide pour un nom fait d’espaces', () => {
    expect(normalizeCategoryName('   ')).toBe('');
  });
});

describe('validateCategoryName', () => {
  const existing = [{ name: 'Alimentation' }, { name: 'Animaux' }];

  it('accepte un nom nouveau', () => {
    expect(validateCategoryName('Sport', existing)).toBeUndefined();
  });

  it('refuse un nom vide', () => {
    expect(validateCategoryName('', existing)).toBe('Donnez un nom à la catégorie.');
  });

  it('accepte exactement la longueur maximale', () => {
    expect(validateCategoryName('a'.repeat(CATEGORY_NAME_MAX_LENGTH), existing)).toBeUndefined();
  });

  it('refuse un caractère de trop', () => {
    expect(validateCategoryName('a'.repeat(CATEGORY_NAME_MAX_LENGTH + 1), existing)).toBe(
      '30 caractères au plus.'
    );
  });

  it('compte un emoji comme un seul caractère, comme char_length()', () => {
    expect(validateCategoryName('🐶'.repeat(CATEGORY_NAME_MAX_LENGTH), existing)).toBeUndefined();
  });

  it('refuse un homonyme, casse comprise', () => {
    expect(validateCategoryName('ALIMENTATION', existing)).toBe('Une catégorie porte déjà ce nom.');
    expect(validateCategoryName('animaux', existing)).toBe('Une catégorie porte déjà ce nom.');
  });
});

describe('hideShadowedDefaults', () => {
  const tontineDefault = { id: 'd1', group_id: null, name: 'Tontine', type: 'expense' };
  const tontineIncome = { id: 'd2', group_id: null, name: 'Tontine', type: 'income' };
  const alimentation = { id: 'd3', group_id: null, name: 'Alimentation', type: 'expense' };
  const ownTontine = { id: 'g1', group_id: 'g', name: 'tontine', type: 'expense' };

  it('masque la catégorie par défaut quand le groupe a la sienne, casse ignorée', () => {
    expect(hideShadowedDefaults([alimentation, tontineDefault, ownTontine])).toEqual([
      alimentation,
      ownTontine,
    ]);
  });

  it('ne masque pas une catégorie par défaut de l’autre type', () => {
    expect(hideShadowedDefaults([tontineIncome, ownTontine])).toEqual([tontineIncome, ownTontine]);
  });

  it('laisse la liste intacte sans catégorie du groupe', () => {
    expect(hideShadowedDefaults([alimentation, tontineDefault])).toEqual([
      alimentation,
      tontineDefault,
    ]);
  });
});
