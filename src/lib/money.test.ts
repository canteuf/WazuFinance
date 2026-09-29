import {
  amountDigits,
  formatAmount,
  formatBalance,
  formatDelta,
  formatMoney,
  formatSigned,
  groupDigits,
  parseAmount,
  parseNonNegativeAmount,
  previewSum,
  spokenAmount,
  toAmountInput,
  withCurrency,
} from '@/lib/money';

// Le séparateur de milliers de fr-FR est une espace fine insécable (U+202F), et le code de devise est précédé d'une espace insécable (U+00A0) : écrites en clair, les attentes seraient fausses alors que le code est juste.
describe('groupDigits', () => {
  it('groupe les milliers pendant la saisie', () => {
    expect(groupDigits('150000')).toBe('150 000');
    expect(groupDigits('1500000')).toBe('1 500 000');
  });

  it('laisse un petit montant tel quel', () => {
    expect(groupDigits('')).toBe('');
    expect(groupDigits('650')).toBe('650');
  });

  it('groupe comme formatAmount, pour que saisie et affichage se ressemblent', () => {
    expect(groupDigits('12500')).toBe(formatAmount(12500));
  });
});

describe('amountDigits', () => {
  it('retire les espaces insérées par groupDigits', () => {
    expect(amountDigits(groupDigits('1500000'))).toBe('1500000');
  });

  it('retire ce qu’un collage apporte', () => {
    expect(amountDigits('12 500 FCFA')).toBe('12500');
  });

  it('rend une saisie que parseAmount accepte', () => {
    expect(parseAmount(amountDigits('150 000'))).toBe(150000);
  });
});

describe('parseAmount', () => {
  it('accepte un entier', () => {
    expect(parseAmount('650')).toBe(650);
  });

  it('ignore les espaces autour', () => {
    expect(parseAmount('  12500 ')).toBe(12500);
  });

  it('refuse une décimale : le franc CFA n’a pas de sous-unité', () => {
    expect(parseAmount('24,90')).toBeNull();
    expect(parseAmount('24.90')).toBeNull();
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

  it('refuse ce qui n’est pas un nombre', () => {
    expect(parseAmount('douze')).toBeNull();
  });

  it('accepte le plus grand montant que numeric(12,2) contient', () => {
    expect(parseAmount('9999999999')).toBe(9_999_999_999);
  });

  it('refuse un montant hors capacité de numeric(12,2)', () => {
    expect(parseAmount('12345678901')).toBeNull();
  });
});

describe('formatAmount', () => {
  it('n’affiche aucune décimale', () => {
    expect(formatAmount(2490)).toBe('2 490');
  });

  it('arrondit une valeur décimale héritée d’avant le franc CFA', () => {
    expect(formatAmount(24.9)).toBe('25');
  });

  it('sépare les milliers', () => {
    expect(formatAmount(1500)).toBe('1 500');
  });
});

describe('formatMoney', () => {
  it('ajoute le code de la devise après une espace insécable', () => {
    expect(formatMoney(1500)).toBe('1 500 FCFA');
  });
});

describe('withCurrency', () => {
  it('complète un montant déjà formaté, signe compris', () => {
    expect(withCurrency(formatDelta(320))).toBe('+320 FCFA');
  });
});

describe('spokenAmount', () => {
  it('épelle la devise pour un lecteur d’écran', () => {
    expect(spokenAmount(1500)).toBe('1 500 francs CFA');
  });

  it('accorde au singulier sous deux', () => {
    expect(spokenAmount(1)).toBe('1 franc CFA');
    expect(spokenAmount(0)).toBe('0 franc CFA');
    expect(spokenAmount(2)).toBe('2 francs CFA');
  });
});

describe('toAmountInput', () => {
  it('rend un texte que parseAmount relit, sans séparateur de milliers', () => {
    expect(toAmountInput(1500)).toBe('1500');
    expect(parseAmount(toAmountInput(1500))).toBe(1500);
  });

  it('arrondit une valeur décimale héritée d’avant le franc CFA', () => {
    expect(toAmountInput(24.9)).toBe('25');
  });
});

describe('formatSigned', () => {
  it('préfixe une dépense d’un moins', () => {
    expect(formatSigned(2490, 'expense')).toBe('−2 490 FCFA');
  });

  it('préfixe un revenu d’un plus', () => {
    expect(formatSigned(150000, 'income')).toBe('+150 000 FCFA');
  });
});

describe('formatBalance', () => {
  it('laisse un solde positif sans signe', () => {
    expect(formatBalance(139178)).toBe('139 178');
  });

  // Signe moins typographique (U+2212), pas trait d'union : c'est ce qui tient l'alignement d'une colonne de chiffres tabulaires.
  it('préfixe un solde négatif du signe moins typographique', () => {
    expect(formatBalance(-78822)).toBe('−78 822');
  });

  it('ne signe pas un solde nul', () => {
    expect(formatBalance(0)).toBe('0');
  });
});

describe('formatDelta', () => {
  // La différence avec formatBalance est tout l'intérêt de cette fonction : une progression sans signe explicite ne dit pas dans quel sens elle va.
  it('marque explicitement une progression', () => {
    expect(formatDelta(320)).toBe('+320');
  });

  it('marque un recul du signe moins typographique', () => {
    expect(formatDelta(-120)).toBe('−120');
  });

  it('traite un écart nul comme une progression', () => {
    expect(formatDelta(0)).toBe('+0');
  });
});

describe('parseNonNegativeAmount', () => {
  it('accepte zéro', () => {
    expect(parseNonNegativeAmount('0')).toBe(0);
  });

  it('accepte un entier', () => {
    expect(parseNonNegativeAmount('25000')).toBe(25000);
  });

  it('refuse une décimale : le franc CFA n’a pas de sous-unité', () => {
    expect(parseNonNegativeAmount('24,90')).toBeNull();
  });

  it('refuse un montant négatif', () => {
    expect(parseNonNegativeAmount('-10')).toBeNull();
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

  it('additionne des montants entiers', () => {
    expect(previewSum(125000, 25000)).toBe(150000);
  });
});
