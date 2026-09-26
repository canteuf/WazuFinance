import { addTag, MAX_TAG_LENGTH, normalizeTag, tagSuggestions } from '@/lib/tags';

describe('normalizeTag', () => {
  it('rogne et resserre les espaces', () => {
    expect(normalizeTag('  Argent   de  Jean ')).toBe('Argent de Jean');
  });

  it('rend null pour un texte vide', () => {
    expect(normalizeTag('   ')).toBeNull();
  });

  it('coupe à la longueur permise, sans espace finale', () => {
    const tag = normalizeTag(`${'a'.repeat(MAX_TAG_LENGTH - 1)} bcd`);
    expect(tag).toBe('a'.repeat(MAX_TAG_LENGTH - 1));
  });
});

describe('addTag', () => {
  it('ajoute une étiquette nouvelle', () => {
    expect(addTag(['Rentrée 2027'], 'Argent de Jean')).toEqual(['Rentrée 2027', 'Argent de Jean']);
  });

  it('ignore un doublon, casse comprise', () => {
    expect(addTag(['Argent de Jean'], 'argent DE jean')).toEqual(['Argent de Jean']);
  });

  it('reprend l’écriture d’une étiquette déjà utilisée dans le groupe', () => {
    expect(addTag([], 'argent de jean', ['Argent de Jean'])).toEqual(['Argent de Jean']);
  });

  it('s’arrête à cinq étiquettes', () => {
    const five = ['a', 'b', 'c', 'd', 'e'];
    expect(addTag(five, 'f')).toBe(five);
  });

  it('ignore un texte vide', () => {
    expect(addTag(['a'], '  ')).toEqual(['a']);
  });
});

describe('tagSuggestions', () => {
  const known = ['Argent de Jean', 'Rentrée 2027', 'Mariage Awa', 'Jeans'];

  it('propose les étiquettes pas encore choisies', () => {
    expect(tagSuggestions(known, ['Mariage Awa'], '')).toEqual(['Argent de Jean', 'Rentrée 2027', 'Jeans']);
  });

  it('met en tête celles qui commencent par le texte tapé', () => {
    expect(tagSuggestions(known, [], 'jea')).toEqual(['Jeans', 'Argent de Jean']);
  });

  it('respecte la limite', () => {
    expect(tagSuggestions(known, [], '', 2)).toHaveLength(2);
  });
});
