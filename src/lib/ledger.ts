import { dateToIso, isoToDate } from '@/lib/dates';

export type DaySection<T> = {
  /** Date ISO du jour, clé de rapprochement avec les totaux de daily_totals(). */
  date: string;
  data: T[];
};

/**
 * Regroupe des lignes déjà triées par date décroissante en une section par jour, dans le même ordre.
 *
 * Ne trie rien : l'ordre vient de la requête paginée, et le refaire ici pourrait le contredire. Ne somme rien non plus — les totaux de jour viennent de daily_totals(), calculés en base sur toutes les lignes du jour, chargées ou non.
 */
export function groupByDay<T extends { occurred_on: string }>(rows: T[]): DaySection<T>[] {
  const sections: DaySection<T>[] = [];
  for (const row of rows) {
    const last = sections[sections.length - 1];
    if (last && last.date === row.occurred_on) {
      last.data.push(row);
    } else {
      sections.push({ date: row.occurred_on, data: [row] });
    }
  }
  return sections;
}

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const dayWithYearFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Titre d'un jour dans le livre de comptes : « Aujourd'hui, 19 octobre », « Hier, 18 octobre », « 15 octobre ».
 *
 * L'année n'apparaît que si elle diffère de l'année en cours : sur « Depuis le début », décembre dernier et décembre d'il y a deux ans ne doivent pas se confondre.
 */
export function dayTitle(iso: string, today: string): string {
  const date = isoToDate(iso);
  const now = isoToDate(today);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const formatted =
    date.getFullYear() === now.getFullYear()
      ? dayFormatter.format(date)
      : dayWithYearFormatter.format(date);

  if (iso === today) {
    return `Aujourd’hui, ${formatted}`;
  }
  if (iso === dateToIso(yesterday)) {
    return `Hier, ${formatted}`;
  }
  return formatted;
}
