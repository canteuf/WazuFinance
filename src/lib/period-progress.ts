import { isoToDate } from '@/lib/dates';

export type PeriodProgress = {
  /** Jours écoulés depuis le début, jour courant compris. Jamais au-delà de `totalDays`. */
  elapsedDays: number;
  /** Durée de la période en jours. Varie avec les mois : 28 à 31. */
  totalDays: number;
  /**
   * Jours qu'il reste à couvrir, jour courant compris : 1 le dernier jour, 0 une fois la période close.
   *
   * Ce n'est donc pas `totalDays - elapsedDays`, qui vaudrait zéro le dernier jour alors qu'il reste une journée à financer. Les deux comptent le jour courant, chacun de son côté : il est à la fois entamé et à vivre.
   */
  remainingDays: number;
  /** Part écoulée, de 0 à 1. */
  ratio: number;
};

/**
 * Où en est la période, en jours.
 *
 * Tout est compté en jours pleins, pas en heures : la période est bornée par deux dates, et introduire l'heure ferait varier l'affichage au fil de la journée sans rien apprendre à personne.
 *
 * Les bornes forment un intervalle semi-ouvert [from, to), comme partout ailleurs dans le projet. Le dernier jour de la période est donc la veille de `to`, et « il reste 1 jour » s'affiche ce jour-là.
 *
 * `today` hors de l'intervalle est un cas normal, pas une erreur : l'historique sait afficher une période passée. Le résultat sature alors à 0 ou à la durée totale plutôt que de sortir des bornes.
 */
export function periodProgress(today: string, from: string, to: string): PeriodProgress {
  const totalDays = daysBetween(from, to);
  const elapsed = daysBetween(from, today) + 1;

  const elapsedDays = Math.min(Math.max(elapsed, 0), totalDays);
  // Compté depuis `today` vers la fin, et non déduit de `elapsedDays` : les deux incluent le jour courant, qui est entamé et reste à financer.
  const remainingDays = Math.min(Math.max(daysBetween(today, to), 0), totalDays);

  return {
    elapsedDays,
    totalDays,
    remainingDays,
    ratio: totalDays === 0 ? 0 : elapsedDays / totalDays,
  };
}

/**
 * Montant disponible par jour restant.
 *
 * `null` quand il n'y a plus de jour à couvrir — la période est close — ou quand il ne reste rien à dépenser : afficher « 0 XAF par jour » sur un budget dépassé ajouterait un chiffre là où le dépassement est déjà dit ailleurs, et diviser par zéro n'a pas de sens.
 *
 * Une seule division, sur des totaux que Postgres a déjà sommés exactement : la règle du projet interdit d'additionner des montants en JavaScript, pas de diviser un total par un nombre de jours.
 */
export function dailyAllowance(remaining: number, remainingDays: number): number | null {
  if (remainingDays <= 0 || remaining <= 0) {
    return null;
  }
  return remaining / remainingDays;
}

/** Écart en jours pleins entre deux dates ISO. Négatif si `to` précède `from`. */
function daysBetween(from: string, to: string): number {
  const start = isoToDate(from);
  const end = isoToDate(to);

  // Les deux dates sont construites à minuit local par isoToDate(), donc leur écart est un multiple exact de 24 h — sauf aux changements d'heure, où l'un des deux jours dure 23 ou 25 h. L'arrondi absorbe ce décalage, qui sinon retirerait un jour à toute période traversant le passage à l'heure d'hiver.
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay);
}
