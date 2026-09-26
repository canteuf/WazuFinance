/**
 * Journal d'activité en PDF, pour le lire en réunion — une tontine qui rend ses comptes — ou l'archiver. Même principe que le relevé des opérations (`pdf-report.ts`) : un document HTML que expo-print convertit, pur et couvert par Jest.
 *
 * Les phrases arrivent déjà rédigées par `formatActivity()` : le PDF dit exactement ce que l'écran dit.
 */

import { escapeHtml } from '@/lib/pdf-report';

export type ActivityReportLine = {
  /** « 8 sept. 2026, 09:05 ». */
  when: string;
  sentence: string;
};

export type ActivityReportInput = {
  groupName: string;
  /** « 26 septembre 2026 à 21:40 ». */
  generatedAt: string;
  lines: ActivityReportLine[];
};

export function buildActivityReportHtml(input: ActivityReportInput): string {
  const count = input.lines.length === 1 ? '1 entrée' : `${input.lines.length} entrées`;
  const rows =
    input.lines.length > 0
      ? input.lines
          .map(
            (line) =>
              `<tr><td class="when">${escapeHtml(line.when)}</td><td>${escapeHtml(line.sentence)}</td></tr>`
          )
          .join('\n')
      : '<tr><td class="empty" colspan="2">Aucune activité.</td></tr>';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Journal ${escapeHtml(input.groupName)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #12201C; font-size: 11pt; }
  header { border-bottom: 2px solid #08775A; padding-bottom: 10px; margin-bottom: 16px; }
  .brand { color: #08775A; font-weight: 800; letter-spacing: 1.5px; font-size: 9pt; text-transform: uppercase; }
  h1 { font-size: 20pt; margin: 4px 0 2px; }
  .meta { color: #5E6E69; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { text-align: left; color: #5E6E69; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1px solid #DDE5E2; padding: 6px; }
  td { border-bottom: 1px solid #EEF2F0; padding: 6px; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .when { white-space: nowrap; color: #5E6E69; font-variant-numeric: tabular-nums; width: 1%; }
  .empty { color: #5E6E69; text-align: center; padding: 24px; }
  footer { margin-top: 14px; padding-top: 14px; border-top: 1px solid #EEF2F0; color: #5E6E69; font-size: 8.5pt; }
</style>
</head>
<body>
<header>
  <div class="brand">Wazu Finance · Journal d’activité</div>
  <h1>${escapeHtml(input.groupName)}</h1>
  <div class="meta">${count}, des plus récentes aux plus anciennes</div>
</header>
<table>
  <thead><tr><th>Quand</th><th>Ce qui s’est passé</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
<footer>Édité le ${escapeHtml(input.generatedAt)}.</footer>
</body>
</html>`;
}
