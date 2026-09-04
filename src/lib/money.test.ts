import { formatAmount, formatSigned, parseAmount } from '@/lib/money';

describe('parseAmount', () => {
  it('accepte la virgule décimale française', () => {
    expect(parseAmount('24,90')).toBe(24.9);
  });

  it('accepte aussi le point décimal', () => {
    expect(parseAmount('24.90')).toBe(24.9);
  });

  it('accepte un entier', () => {
    expect(parseAmount('650')).toBe(650);
  });

  it('ignore les espaces autour', () => {
    expect(parseAmount('  12,50 ')).toBe(12.5);
  });

  it('refuse une chaîne vide', () => {
    expect(parseAmount('')).toBeNull();
  });

  it('refuse zéro, le schéma exige un montant strictement positif', () => {
    expect(parseAmount('0')).toBeNull();
  });

  it('refuse un montant négatif : le signe vient du type', () => {
    expect(parseAmount('-10')).toBeNull();
  });

  it('refuse plus de deux décimales', () => {
    expect(parseAmount('10,999')).toBeNull();
  });

  it('refuse ce qui n’est pas un nombre', () => {
    expect(parseAmount('douze')).toBeNull();
  });

  it('refuse un montant hors capacité de numeric(12,2)', () => {
    expect(parseAmount('12345678901')).toBeNull();
  });
});

describe('formatAmount', () => {
  it('affiche deux décimales avec une virgule', () => {
    expect(formatAmount(24.9)).toBe('24,90');
  });

  it('sépare les milliers', () => {
    expect(formatAmount(1500)).toBe('1 500,00');
  });
});

describe('formatSigned', () => {
  it('préfixe une dépense d’un moins', () => {
    expect(formatSigned(24.9, 'expense')).toBe('-24,90 €');
  });

  it('préfixe un revenu d’un plus', () => {
    expect(formatSigned(1500, 'income')).toBe('+1 500,00 €');
  });
});
