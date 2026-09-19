import {
  formatAmount,
  formatBalance,
  formatDelta,
  formatSigned,
  parseAmount,
  parseNonNegativeAmount,
  previewSum,
} from '@/lib/money';

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
    expect(formatSigned(24.9, 'expense')).toBe('−24,90 €');
  });

  it('préfixe un revenu d’un plus', () => {
    expect(formatSigned(1500, 'income')).toBe('+1 500,00 €');
  });
});

describe('formatBalance', () => {
  // Le séparateur de milliers de fr-FR est une espace fine insécable (U+202F), pas une espace ordinaire : écrite en clair, l'attente serait fausse alors que le code est juste.
  it('laisse un solde positif sans signe', () => {
    expect(formatBalance(1391.78)).toBe('1 391,78');
  });

  // Signe moins typographique (U+2212), pas trait d'union : c'est ce qui tient l'alignement d'une colonne de chiffres tabulaires.
  it('préfixe un solde négatif du signe moins typographique', () => {
    expect(formatBalance(-788.22)).toBe('−788,22');
  });

  it('ne signe pas un solde nul', () => {
    expect(formatBalance(0)).toBe('0,00');
  });
});

describe('formatDelta', () => {
  // La différence avec formatBalance est tout l'intérêt de cette fonction : une progression sans signe explicite ne dit pas dans quel sens elle va.
  it('marque explicitement une progression', () => {
    expect(formatDelta(320)).toBe('+320,00');
  });

  it('marque un recul du signe moins typographique', () => {
    expect(formatDelta(-120)).toBe('−120,00');
  });

  it('traite un écart nul comme une progression', () => {
    expect(formatDelta(0)).toBe('+0,00');
  });
});

describe('parseNonNegativeAmount', () => {
  it('accepte zéro', () => {
    expect(parseNonNegativeAmount('0')).toBe(0);
  });

  it('accepte une décimale avec virgule', () => {
    expect(parseNonNegativeAmount('24,90')).toBe(24.9);
  });

  it('refuse un montant négatif', () => {
    expect(parseNonNegativeAmount('-10')).toBeNull();
  });

  it('refuse plus de deux décimales', () => {
    expect(parseNonNegativeAmount('10,999')).toBeNull();
  });

  it('refuse une saisie non numérique', () => {
    expect(parseNonNegativeAmount('douze')).toBeNull();
  });

  it('refuse un montant hors bornes', () => {
    expect(parseNonNegativeAmount('12345678901')).toBeNull();
  });
});

describe('previewSum', () => {
  it('additionne au centime, sans erreur de flottant', () => {
    expect(previewSum(0.1, 0.2)).toBe(0.3);
    expect(previewSum(1850, 150.1)).toBe(2000.1);
  });

  it('retranche un delta négatif', () => {
    expect(previewSum(200, -50.55)).toBe(149.45);
  });
});
