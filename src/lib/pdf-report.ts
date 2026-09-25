/**
 * Relevé PDF des opérations, sous forme de document HTML que expo-print convertit en PDF (et que le navigateur imprime sur le web).
 *
 * Pur et sans React : le contenu et l'échappement sont couverts par Jest. Les totaux arrivent déjà sommés par Postgres (filtered_totals) — ce module ne fait aucune addition de montants.
 *
 * Mise en page A4 en CSS d'impression, polices système : expo-print rend dans une WebView qui n'a pas accès aux polices chargées par l'app, et embarquer Bricolage Grotesque en base64 alourdirait chaque export pour un document qu'on lit surtout imprimé ou archivé.
 */

import type { ExportRow } from '@/lib/csv';
import { formatBalance, formatSigned, withCurrency } from '@/lib/money';

export type ReportTotals = {
  income: number;
  expense: number;
  /** Épargne nette : versements moins retraits. Ni une entrée ni une sortie, mais déduite du solde. */
  savings: number;
  balance: number;
  txCount: number;
};

export type ReportInput = {
  groupName: string;
  /** « Septembre 2026 », « du 5 sept. au 4 oct. », « Depuis le début ». */
  periodLabel: string;
  /** Filtres actifs en plus de la période, déjà rédigés : « Dépenses · Alimentation · "marché" ». Vide s'il n'y en a pas. */
  filtersLabel: string;
  /** « 19 septembre 2026 à 21:40 ». */
  generatedAt: string;
  totals: ReportTotals;
  rows: ExportRow[];
};

const escapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Tout texte saisi par un membre (note, nom de catégorie, nom de groupe) passe par ici : sans échappement, une note « <img src=x onerror=…> » s'exécuterait dans la WebView d'impression. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => escapes[char]);
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function formatRowDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return dateFormatter.format(new Date(year, month - 1, day));
}

function row(item: ExportRow): string {
  const sign = item.type === 'expense' ? 'expense' : 'income';
  return `<tr>
  <td class="date">${formatRowDate(item.occurredOn)}</td>
  <td>${escapeHtml(item.categoryName ?? 'Sans catégorie')}</td>
  <td class="note">${escapeHtml(item.note ?? '')}</td>
  <td class="author">${escapeHtml(item.authorName ?? '')}</td>
  <td class="amount ${sign}">${formatSigned(item.amount, item.type)}</td>
</tr>`;
}

export function buildTransactionsReportHtml(input: ReportInput): string {
  const { totals } = input;
  const countLabel = totals.txCount === 1 ? '1 opération' : `${totals.txCount} opérations`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relevé ${escapeHtml(input.groupName)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  /* La page fait au moins la hauteur du papier, moins ses marges : c'est ce qui permet à la mention d'édition de descendre en pied de page quand le relevé tient sur une page, au lieu de flotter juste sous la dernière écriture. */
  html, body { min-height: calc(297mm - 32mm); }
  body { margin: 0; display: flex; flex-direction: column; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #12201C; font-size: 11pt; }
  header { border-bottom: 2px solid #08775A; padding-bottom: 10px; margin-bottom: 16px; }
  .brand { color: #08775A; font-weight: 800; letter-spacing: 1.5px; font-size: 9pt; text-transform: uppercase; }
  h1 { font-size: 20pt; margin: 4px 0 2px; }
  .meta { color: #5E6E69; font-size: 10pt; }
  .totals { display: flex; gap: 10px; margin-bottom: 18px; }
  .total { flex: 1; background: #F1F5F3; border-radius: 8px; padding: 10px 12px; }
  .total .label { color: #5E6E69; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1px; }
  .total .value { font-size: 14pt; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
  /* flex: none — dans le corps en colonne, le tableau garderait sinon la place restante et ses filets s'étireraient jusqu'au pied. */
  table { width: 100%; border-collapse: collapse; flex: none; }
  thead { display: table-header-group; }
  th { text-align: left; color: #5E6E69; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1px solid #DDE5E2; padding: 6px 6px; }
  td { border-bottom: 1px solid #EEF2F0; padding: 6px 6px; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .date { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .note { color: #3A4A45; }
  .author { color: #5E6E69; white-space: nowrap; }
  .amount { text-align: right; white-space: nowrap; font-weight: 600; font-variant-numeric: tabular-nums; }
  th.amount { font-weight: normal; }
  .income { color: #0B7A5B; }
  .empty { color: #5E6E69; text-align: center; padding: 24px; }
  /* margin-top: auto pousse le pied au bas de la page tant que le contenu est plus court qu'elle ; au-delà, il reprend sa place à la suite du tableau, sur la dernière page. Un pied répété sur chaque page demanderait une position fixe, que la WebView d'impression d'Android ne rend pas de façon fiable. */
  footer { margin-top: auto; padding-top: 14px; border-top: 1px solid #EEF2F0; color: #5E6E69; font-size: 8.5pt; }
</style>
</head>
<body>
<header>
  <div class="brand">Wazu Finance · Relevé</div>
  <h1>${escapeHtml(input.groupName)}</h1>
  <div class="meta">${escapeHtml(input.periodLabel)}${input.filtersLabel ? ` · ${escapeHtml(input.filtersLabel)}` : ''} · ${countLabel}</div>
</header>
<section class="totals">
  <div class="total"><div class="label">Entrées</div><div class="value income">${formatSigned(totals.income, 'income')}</div></div>
  <div class="total"><div class="label">Sorties</div><div class="value">${formatSigned(totals.expense, 'expense')}</div></div>
  ${totals.savings !== 0 ? `<div class="total"><div class="label">Épargne</div><div class="value">${formatSigned(Math.abs(totals.savings), totals.savings > 0 ? 'expense' : 'income')}</div></div>` : ''}
  <div class="total"><div class="label">Solde</div><div class="value">${withCurrency(formatBalance(totals.balance))}</div></div>
</section>
<table>
  <thead><tr><th>Date</th><th>Catégorie</th><th>Note</th><th>Saisie par</th><th class="amount">Montant</th></tr></thead>
  <tbody>
${input.rows.length > 0 ? input.rows.map(row).join('\n') : '<tr><td class="empty" colspan="5">Aucune opération.</td></tr>'}
  </tbody>
</table>
<footer>Édité le ${escapeHtml(input.generatedAt)}.</footer>
</body>
</html>`;
}
