import { containsPattern, normalizeSearch } from '@/lib/search';

describe('normalizeSearch', () => {
  it('retire les espaces de bord', () => {
    expect(normalizeSearch('  biocoop ')).toBe('biocoop');
  });

  it('ne cherche rien quand il ne reste rien', () => {
    expect(normalizeSearch('   ')).toBeNull();
    expect(normalizeSearch('**')).toBeNull();
  });

  it('retire l’astérisque, joker pour PostgREST mais pas pour la base', () => {
    expect(normalizeSearch('bio*coop')).toBe('biocoop');
  });
});

describe('containsPattern', () => {
  it('cherche le terme n’importe où', () => {
    expect(containsPattern('loyer')).toBe('%loyer%');
  });

  it('échappe les jokers de ilike', () => {
    expect(containsPattern('-50%')).toBe('%-50\\%%');
    expect(containsPattern('a_b')).toBe('%a\\_b%');
  });

  it('échappe la barre oblique inverse elle-même', () => {
    expect(containsPattern('a\\b')).toBe('%a\\\\b%');
  });
});
