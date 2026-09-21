import { buildTransactionsCsv, exportFileName, type ExportRow } from '@/lib/csv';

const row: ExportRow = {
  occurredOn: '2026-09-19',
  type: 'expense',
  amount: 12500,
  categoryName: 'Alimentation',
  note: 'Marché',
  authorName: 'Camille',
};

function lines(csv: string): string[] {
  return csv.split('\r\n');
}

describe('buildTransactionsCsv', () => {
  it('commence par une marque UTF-8 pour Excel et un en-tête en point-virgules', () => {
    const csv = buildTransactionsCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines(csv.slice(1))[0]).toBe('Date;Type;Catégorie;Montant;Note;Saisie par');
  });

  it('écrit une dépense en négatif, sans décimale', () => {
    expect(lines(buildTransactionsCsv([row]))[1]).toBe(
      '2026-09-19;Dépense;Alimentation;-12500;Marché;Camille'
    );
  });

  it('écrit un revenu en positif', () => {
    const csv = buildTransactionsCsv([{ ...row, type: 'income', amount: 210000, categoryName: 'Salaire' }]);
    expect(lines(csv)[1]).toContain(';Revenu;Salaire;210000;');
  });

  it('arrondit une valeur décimale héritée d’avant le franc CFA, comme l’affichage', () => {
    expect(lines(buildTransactionsCsv([{ ...row, amount: 12.5 }]))[1]).toContain(';-13;');
    expect(lines(buildTransactionsCsv([{ ...row, amount: 0.4 }]))[1]).toContain(';0;');
  });

  it('entoure de guillemets un texte contenant un séparateur, un guillemet ou un retour à la ligne', () => {
    const csv = buildTransactionsCsv([{ ...row, note: 'Pain; "bio"\nchez Paul' }]);
    expect(csv).toContain(';"Pain; ""bio""\nchez Paul";');
  });

  it('neutralise une note qui serait lue comme une formule', () => {
    const csv = buildTransactionsCsv([{ ...row, note: '=HYPERLINK("http://x")' }]);
    expect(csv).toContain(`;"'=HYPERLINK(""http://x"")";`);
  });

  it('laisse vides la note et l’auteur absents, et nomme l’absence de catégorie', () => {
    const csv = buildTransactionsCsv([{ ...row, note: null, authorName: null, categoryName: null }]);
    expect(lines(csv)[1]).toBe('2026-09-19;Dépense;Sans catégorie;-12500;;');
  });

  it('termine le fichier par une fin de ligne', () => {
    expect(buildTransactionsCsv([row]).endsWith('\r\n')).toBe(true);
  });
});

describe('exportFileName', () => {
  it('nomme le fichier d’après le groupe et la période, jusqu’au dernier jour inclus', () => {
    expect(exportFileName('Coloc Gambetta', '2026-09-01', '2026-10-01')).toBe(
      'wazu-coloc-gambetta-2026-09-01_2026-09-30.csv'
    );
  });

  it('retire accents et caractères spéciaux du nom', () => {
    expect(exportFileName('Éte à Nîmes !', null, null)).toBe('wazu-ete-a-nimes-tout.csv');
  });

  it('se rabat sur « groupe » quand le nom ne contient rien d’utilisable', () => {
    expect(exportFileName('!!!', null, null)).toBe('wazu-groupe-tout.csv');
  });
});
