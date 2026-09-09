import type { TransactionType } from '@/types/database';

/**
 * Montants en euros.
 *
 * La base stocke du numeric(12,2) : au plus deux décimales, et une valeur
 * strictement positive imposée par la contrainte `amount > 0`. Le signe
 * affiché vient du type de la transaction, jamais de la saisie.
 */

const MAX_AMOUNT = 9_999_999_999.99;

/** Renvoie null si la saisie ne peut pas devenir un montant valide. */
export function parseAmount(input: string): number | null {
  const normalised = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) {
    return null;
  }

  const value = Number(normalised);
  if (value <= 0 || value > MAX_AMOUNT) {
    return null;
  }

  return value;
}

const formatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** « 1 500,00 », sans symbole monétaire. */
export function formatAmount(value: number): string {
  return formatter.format(value);
}

/**
 * Signe moins typographique (U+2212), et non le trait d'union.
 *
 * Il a la même chasse que le plus et s'aligne sur la hauteur des chiffres :
 * dans une colonne de montants en chiffres tabulaires, un trait d'union se
 * voit trop court et casse l'alignement optique.
 */
const MINUS = '−';

/** « −24,90 € » pour une dépense, « +1 500,00 € » pour un revenu. */
export function formatSigned(value: number, type: TransactionType): string {
  const sign = type === 'expense' ? MINUS : '+';
  return `${sign}${formatAmount(value)} €`;
}

/** Même chose sans symbole monétaire, le « € » étant porté à côté. */
export function formatSignedBare(value: number, type: TransactionType): string {
  const sign = type === 'expense' ? MINUS : '+';
  return `${sign}${formatAmount(value)}`;
}

/** « 1 391,78 », « −788,22 » : signe seulement s'il est négatif, sans symbole. */
export function formatBalance(value: number): string {
  return value < 0 ? `${MINUS}${formatAmount(Math.abs(value))}` : formatAmount(value);
}

/**
 * Écart entre deux montants, signe toujours visible : « +320,00 », « −120,00 ».
 *
 * Distinct de formatBalance, qui n'affiche le signe que s'il est négatif : un
 * solde de 320 se lit « 320,00 », mais une progression de 320 doit se lire
 * « +320,00 », sans quoi rien ne dit dans quel sens elle va.
 */
export function formatDelta(value: number): string {
  const sign = value < 0 ? MINUS : '+';
  return `${sign}${formatAmount(Math.abs(value))}`;
}
