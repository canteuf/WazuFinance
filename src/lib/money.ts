import type { TransactionType } from '@/types/database';

/**
 * Montants en francs CFA (code ISO XAF pour l'Afrique centrale, XOF pour l'Afrique de l'Ouest).
 *
 * Le franc CFA n'a pas de sous-unité (ISO 4217 : exposant 0) : l'app ne saisit et n'affiche que des montants entiers. La base garde numeric(12,2), sans migration — elle y stocke des entiers, et `amount > 0` reste la contrainte qui compte. Le signe affiché vient du type de la transaction, jamais de la saisie.
 */

/**
 * Unité écrite après chaque montant : « 1 500 FCFA ».
 *
 * « FCFA » et non le code ISO « XAF » : c'est ce qu'on lit sur les étiquettes de prix et dans les apps mobile money, et il vaut pour les deux zones. XAF ne désigne que l'Afrique centrale ; un utilisateur ivoirien y lisait une autre monnaie que la sienne (XOF), de même valeur.
 */
export const CURRENCY_SYMBOL = 'FCFA';

/** Espace insécable entre le montant et le code : sans elle, « 1 500 » et « FCFA » pourraient se retrouver sur deux lignes. */
const NBSP = ' ';

/** Espace fine insécable (U+202F), celle que Intl place entre les milliers en français : un montant tapé s'affiche comme un montant formaté. */
const THIN_NBSP = ' ';

const MAX_AMOUNT = 9_999_999_999;

/** Renvoie null si la saisie ne peut pas devenir un montant valide : des chiffres seuls, sans décimale. */
export function parseAmount(input: string): number | null {
  const normalised = input.trim();
  if (!/^\d+$/.test(normalised)) {
    return null;
  }

  const value = Number(normalised);
  if (value <= 0 || value > MAX_AMOUNT) {
    return null;
  }

  return value;
}

/**
 * Comme parseAmount, mais accepte zéro — un objectif d'épargne commence parfois à 0 FCFA, contrairement à une transaction ou un plafond de budget.
 */
export function parseNonNegativeAmount(input: string): number | null {
  const normalised = input.trim();
  if (!/^\d+$/.test(normalised)) {
    return null;
  }

  const value = Number(normalised);
  if (value < 0 || value > MAX_AMOUNT) {
    return null;
  }

  return value;
}

const formatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** « 1 500 », sans code de devise. Une valeur décimale, héritée d'avant le passage au franc CFA, est arrondie. */
export function formatAmount(value: number): string {
  return formatter.format(value);
}

/** Ajoute le code de la devise à un montant déjà formaté, signé ou non : « +320 FCFA », « 1 391 FCFA ». */
export function withCurrency(formatted: string): string {
  return `${formatted}${NBSP}${CURRENCY_SYMBOL}`;
}

/** « 1 500 FCFA ». */
export function formatMoney(value: number): string {
  return withCurrency(formatAmount(value));
}

/**
 * « 1 500 francs CFA », pour un libellé d'accessibilité : un lecteur d'écran épelle « FCFA » lettre à lettre. Au singulier sous deux, comme le français l'accorde.
 */
export function spokenAmount(value: number): string {
  const unit = Math.abs(Math.round(value)) < 2 ? 'franc CFA' : 'francs CFA';
  return `${formatAmount(value)} ${unit}`;
}

/**
 * Espace fine insécable entre les milliers d'un montant en cours de saisie : « 150 000 ».
 *
 * La saisie se fait sur des chiffres nus, pour que parseAmount les lise tels quels ; seul l'affichage les groupe. Sans groupes, « 150000 » et « 1500000 » se confondaient d'un coup d'œil, et un zéro de trop passait inaperçu. Le zéro de tête éventuel est gardé : c'est ce que l'utilisateur a tapé.
 */
export function groupDigits(digits: string): string {
  if (!/^\d+$/.test(digits)) {
    return digits;
  }
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_NBSP);
}

/** Les chiffres seuls d'un champ de montant : retire les espaces que groupDigits a insérés, et tout ce qu'un collage aurait apporté. */
export function amountDigits(text: string): string {
  return text.replace(/\D/g, '');
}

/** Texte d'un champ de saisie pour un montant existant : « 1500 », sans séparateur de milliers, que parseAmount refuserait. */
export function toAmountInput(value: number): string {
  return String(Math.round(value));
}

/**
 * Signe moins typographique (U+2212), et non le trait d'union.
 *
 * Il a la même chasse que le plus et s'aligne sur la hauteur des chiffres : dans une colonne de montants en chiffres tabulaires, un trait d'union se voit trop court et casse l'alignement optique.
 */
const MINUS = '−';

/** « −2 490 FCFA » pour une dépense, « +150 000 FCFA » pour un revenu. */
export function formatSigned(value: number, type: TransactionType): string {
  const sign = type === 'expense' ? MINUS : '+';
  return `${sign}${formatMoney(value)}`;
}

/** Même chose sans code de devise, le « FCFA » étant porté à côté. */
export function formatSignedBare(value: number, type: TransactionType): string {
  const sign = type === 'expense' ? MINUS : '+';
  return `${sign}${formatAmount(value)}`;
}

/** « 139 178 », « −78 822 » : signe seulement s'il est négatif, sans code de devise. */
export function formatBalance(value: number): string {
  return value < 0 ? `${MINUS}${formatAmount(Math.abs(value))}` : formatAmount(value);
}

/**
 * Écart entre deux montants, signe toujours visible : « +320 », « −120 ».
 *
 * Distinct de formatBalance, qui n'affiche le signe que s'il est négatif : un solde de 320 se lit « 320 », mais une progression de 320 doit se lire « +320 », sans quoi rien ne dit dans quel sens elle va.
 */
export function formatDelta(value: number): string {
  const sign = value < 0 ? MINUS : '+';
  return `${sign}${formatAmount(Math.abs(value))}`;
}

/**
 * Montant après un versement ou un ajustement, pour l'aperçu du formulaire seulement.
 *
 * Le calcul qui fait foi a lieu en base (add_to_savings_goal, adjust_budget_amount). Celui-ci ne sert qu'à afficher « Nouveau total » avant d'enregistrer, et passe par des centimes entiers : additionner les deux nombres tels quels donnerait 0,1 + 0,2 = 0,30000000000000004.
 */
export function previewSum(current: number, delta: number): number {
  return (Math.round(current * 100) + Math.round(delta * 100)) / 100;
}
