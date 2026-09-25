/**
 * Rythme des opérations récurrentes : le jour d'ancrage, l'échéance suivante, et le libellé.
 *
 * Pur et sans React : couvert par Jest. La base refait le même calcul pour avancer une échéance (next_recurrence(), 20260925000500_recurring_and_weekly.sql) et vérifie par une contrainte que chaque échéance tombe sur son jour d'ancrage ; les deux doivent rester d'accord.
 */

import { dateToIso, isoToDate } from '@/lib/dates';
import type { RecurrenceFrequency } from '@/types/database';

/** Le 29, le 30 et le 31 n'existent pas tous les mois : même borne que period_start_day. */
export const MAX_MONTHLY_ANCHOR = 28;

/**
 * Jour d'ancrage d'une récurrence qui part de `date` : le jour du mois pour une mensuelle, ramené à 28 au plus ; le jour de la semaine ISO (1 = lundi, 7 = dimanche) pour une hebdomadaire.
 *
 * Un loyer saisi le 30 revient donc le 28 : c'est le seul jour proche qui existe tous les mois, et l'écran le dit (describeRecurrence()).
 */
export function anchorFor(frequency: RecurrenceFrequency, date: string): number {
  const day = isoToDate(date);
  if (frequency === 'weekly') {
    return day.getDay() === 0 ? 7 : day.getDay();
  }
  return Math.min(day.getDate(), MAX_MONTHLY_ANCHOR);
}

/**
 * Première échéance strictement après `after`, sur le jour d'ancrage. Sert à la création depuis une saisie : l'opération saisie est la première occurrence, la récurrence propose la suivante.
 */
export function nextDueAfter(
  frequency: RecurrenceFrequency,
  anchorDay: number,
  after: string
): string {
  const start = isoToDate(after);
  if (frequency === 'weekly') {
    const isoDay = start.getDay() === 0 ? 7 : start.getDay();
    // Entre 1 et 7 jours : le même jour de la semaine revient sept jours plus tard, jamais le jour même.
    const ahead = ((anchorDay - isoDay + 7) % 7) || 7;
    return dateToIso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + ahead));
  }
  const thisMonth = new Date(start.getFullYear(), start.getMonth(), anchorDay);
  if (thisMonth > start) {
    return dateToIso(thisMonth);
  }
  return dateToIso(new Date(start.getFullYear(), start.getMonth() + 1, anchorDay));
}

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** « Chaque mois, le 5 », « Chaque mois, le 1er », « Chaque lundi ». */
export function describeRecurrence(frequency: RecurrenceFrequency, anchorDay: number): string {
  if (frequency === 'weekly') {
    return `Chaque ${WEEKDAYS[anchorDay - 1]}`;
  }
  return `Chaque mois, le ${anchorDay === 1 ? '1er' : anchorDay}`;
}
