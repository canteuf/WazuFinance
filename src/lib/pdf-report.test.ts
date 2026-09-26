import type { ExportRow } from '@/lib/csv';
import { formatBalance, formatSigned, withCurrency } from '@/lib/money';
import { buildTransactionsReportHtml, escapeHtml, type ReportInput } from '@/lib/pdf-report';

const expense: ExportRow = {
  occurredOn: '2026-09-19',
  type: 'expense',
  amount: 12500,
  categoryName: 'Alimentation',
  note: 'Marché',
  authorName: 'Camille',
  walletName: null,
  tags: [],
};

const input: ReportInput = {
  groupName: 'Coloc Gambetta',
  periodLabel: 'Septembre 2026',
  filtersLabel: '',
  generatedAt: '19 septembre 2026 à 21:40',
  totals: { income: 210000, expense: 12500, savings: 0, debts: 0, balance: 197500, txCount: 2 },
  subtotals: [
    { name: 'Alimentation', type: 'expense', total: 12500, count: 1 },
    { name: 'Salaire', type: 'income', total: 210000, count: 1 },
  ],
  rows: [expense, { ...expense, type: 'income', amount: 210000, categoryName: 'Salaire', note: null }],
};

describe('escapeHtml', () => {
  it('neutralise les caractères qui ouvriraient une balise ou un attribut', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')"> & co`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; co'
    );
  });
});

describe('buildTransactionsReportHtml', () => {
  const html = buildTransactionsReportHtml(input);

  it('nomme le groupe, la période et le nombre d’opérations', () => {
    expect(html).toContain('<h1>Coloc Gambetta</h1>');
    expect(html).toContain('Septembre 2026 · 2 opérations');
  });

  it('reprend les totaux tels que fournis, sans les recalculer', () => {
    expect(html).toContain(formatSigned(210000, 'income'));
    expect(html).toContain(formatSigned(12500, 'expense'));
    expect(html).toContain(withCurrency(formatBalance(197500)));
  });

  it('liste une ligne par opération, date au format français', () => {
    expect(html.match(/<tr>\n {2}<td class="date">/g)).toHaveLength(2);
    expect(html).toContain('<td class="date">19/09/2026</td>');
  });

  it('échappe une note saisie par un membre', () => {
    const hostile = buildTransactionsReportHtml({
      ...input,
      rows: [{ ...expense, note: '<script>alert(1)</script>' }],
    });
    expect(hostile).not.toContain('<script>');
    expect(hostile).toContain('&lt;script&gt;');
  });

  it('ajoute les filtres actifs à la ligne de période', () => {
    const filtered = buildTransactionsReportHtml({ ...input, filtersLabel: 'Dépenses · Alimentation' });
    expect(filtered).toContain('Septembre 2026 · Dépenses · Alimentation · 2 opérations');
  });

  it('n’affiche la case Épargne que s’il y a eu un mouvement', () => {
    expect(html).not.toContain('>Épargne<');
    const withSavings = buildTransactionsReportHtml({
      ...input,
      totals: { ...input.totals, savings: 50000, balance: 147500 },
    });
    expect(withSavings).toContain('>Épargne<');
    expect(withSavings).toContain(formatSigned(50000, 'expense'));
  });

  it('n’affiche la case Prêts et dettes que s’il y a eu un mouvement', () => {
    expect(html).not.toContain('>Prêts et dettes<');
    const withDebts = buildTransactionsReportHtml({
      ...input,
      totals: { ...input.totals, debts: -50000, balance: 147500 },
    });
    expect(withDebts).toContain('>Prêts et dettes<');
    expect(withDebts).toContain(formatSigned(50000, 'expense'));
  });

  it('donne les sous-totaux par catégorie, sorties puis entrées', () => {
    expect(html).toContain('>Sorties par catégorie<');
    expect(html).toContain('>Entrées par catégorie<');
    expect(html.indexOf('Sorties par catégorie')).toBeLessThan(html.indexOf('Entrées par catégorie'));
    const none = buildTransactionsReportHtml({ ...input, subtotals: [] });
    expect(none).not.toContain('par catégorie');
  });

  it('nomme les opérations sans catégorie dans les sous-totaux', () => {
    const withSavings = buildTransactionsReportHtml({
      ...input,
      subtotals: [{ name: null, type: 'expense', total: 50000, count: 2 }],
    });
    expect(withSavings).toContain('Épargne, prêts, sans catégorie');
  });

  it('n’ajoute la colonne Portefeuille que si les lignes en nomment un', () => {
    expect(html).not.toContain('<th>Portefeuille</th>');
    const withWallet = buildTransactionsReportHtml({ ...input, rows: [{ ...expense, walletName: 'MoMo' }] });
    expect(withWallet).toContain('<th>Portefeuille</th>');
    expect(withWallet).toContain('>MoMo<');
  });

  it('écrit les étiquettes sous la note, échappées', () => {
    const tagged = buildTransactionsReportHtml({ ...input, rows: [{ ...expense, tags: ['Argent <de> Jean'] }] });
    expect(tagged).toContain('<div class="tags">Argent &lt;de&gt; Jean</div>');
  });

  it('dit qu’il n’y a rien plutôt que de rendre un tableau vide', () => {
    const empty = buildTransactionsReportHtml({ ...input, rows: [] });
    expect(empty).toContain('Aucune opération.');
  });
});
