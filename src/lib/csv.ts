/**
 * Export CSV des opérations.
 *
 * Le format vise Excel en français, là où le fichier sera ouvert le plus souvent : point-virgule comme séparateur (la virgule y est le séparateur décimal), montants à virgule, et une marque d'ordre des octets UTF-8 en tête, sans laquelle Excel lit « Santé » comme « SantÃ© ». LibreOffice et Numbers acceptent ce format tel quel.
 *
 * Pur et sans React : le format est couvert par Jest.
 */

import { dateToIso, isoToDate } from '@/lib/dates';
import type { Tables } from '@/types/database';

export type ExportRow = {
  occurredOn: string;
  type: Tables<'transactions'>['type'];
  amount: number;
  categoryName: string | null;
  note: string | null;
  authorName: string | null;
};

const SEPARATOR = ';';
const BOM = String.fromCharCode(0xfeff);
// CRLF : la fin de ligne de la RFC 4180, et celle qu'Excel attend.
const EOL = '\r\n';

const HEADER = ['Date', 'Type', 'Catégorie', 'Montant', 'Note', 'Saisie par'];

/**
 * Un texte saisi par un membre qui commence par `=`, `+`, `-`, `@` ou une tabulation serait exécuté comme une formule à l'ouverture dans un tableur (injection CSV). Préfixé d'une apostrophe, il s'affiche tel quel. Ne s'applique qu'aux textes libres : le montant, lui, commence légitimement par un signe moins.
 */
function neutralize(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function quote(cell: string): string {
  return /[";\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** Montant signé, deux décimales, virgule : les dépenses en négatif pour qu'une somme de la colonne donne le solde. */
function formatCsvAmount(amount: number, type: ExportRow['type']): string {
  const signed = type === 'expense' ? -amount : amount;
  return signed.toFixed(2).replace('.', ',');
}

export function buildTransactionsCsv(rows: ExportRow[]): string {
  const lines = rows.map((row) =>
    [
      // ISO `AAAA-MM-JJ` : se trie correctement comme texte, et Excel comme LibreOffice le reconnaissent comme une date.
      row.occurredOn,
      row.type === 'expense' ? 'Dépense' : 'Revenu',
      quote(neutralize(row.categoryName ?? 'Sans catégorie')),
      formatCsvAmount(row.amount, row.type),
      quote(neutralize(row.note ?? '')),
      quote(neutralize(row.authorName ?? '')),
    ].join(SEPARATOR)
  );

  return BOM + [HEADER.join(SEPARATOR), ...lines].join(EOL) + EOL;
}

/**
 * « wazu-coloc-gambetta-2026-09-01_2026-09-30.csv ». Le nom du groupe passe en minuscules sans accents ni espaces : certains systèmes de fichiers et messageries les supportent mal.
 *
 * `to` est la borne exclue des filtres, comme partout dans l'app ; le nom affiche le dernier jour inclus, celui qu'un humain attend.
 */
export function exportFileName(
  groupName: string,
  from: string | null,
  to: string | null,
  extension: 'csv' | 'pdf' = 'csv'
): string {
  const slug =
    groupName
      .normalize('NFD')
      // Les diacritiques laissés par la décomposition NFD, U+0300 à U+036F.
      .replace(/[\p{Diacritic}]/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'groupe';
  let period = 'tout';
  if (from && to) {
    const last = isoToDate(to);
    last.setDate(last.getDate() - 1);
    period = `${from}_${dateToIso(last)}`;
  }
  return `wazu-${slug}-${period}.${extension}`;
}
