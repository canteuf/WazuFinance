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

/** « -24,90 € » pour une dépense, « +1 500,00 € » pour un revenu. */
export function formatSigned(value: number, type: TransactionType): string {
  const sign = type === 'expense' ? '-' : '+';
  return `${sign}${formatAmount(value)} €`;
}
