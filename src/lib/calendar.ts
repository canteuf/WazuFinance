/**
 * Calcul du calendrier de CalendarSheet : grille d'un mois, navigation, bornes.
 *
 * Pur et sans React, pour que les cas limites (mois qui commence un dimanche, passage d'année, bornes) soient couverts par Jest plutôt qu'enfouis dans le JSX. Tout circule en chaînes `YYYY-MM-DD`, comme le reste de src/lib/dates.ts : elles se comparent dans l'ordre lexicographique, sans passer par un Date et son fuseau.
 */

export type MonthRef = {
  year: number;
  /** 0 = janvier, comme Date. */
  month: number;
};

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function monthOf(value: string): MonthRef {
  const [year, month] = value.split('-').map(Number);
  return { year, month: month - 1 };
}

export function shiftMonth({ year, month }: MonthRef, delta: number): MonthRef {
  // Date normalise les débordements : le mois 12 devient janvier de l'année suivante.
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function firstDayOf({ year, month }: MonthRef): string {
  return iso(year, month, 1);
}

export function lastDayOf({ year, month }: MonthRef): string {
  // Le jour 0 du mois suivant est le dernier jour de celui-ci.
  return iso(year, month, new Date(year, month + 1, 0).getDate());
}

/**
 * Semaines du mois, lundi en tête comme en France. `null` pour les cases qui appartiennent au mois d'avant ou d'après : elles restent vides plutôt que d'afficher des jours qu'on ne peut pas choisir d'ici.
 *
 * Seulement les semaines nécessaires (4 à 6) : la feuille garde la hauteur de son contenu.
 */
export function monthGrid(ref: MonthRef): (string | null)[][] {
  const { year, month } = ref;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // getDay() : 0 = dimanche. Décalé pour que lundi vaille 0.
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;

  const cells: (string | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => iso(year, month, index + 1)),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: (string | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) {
    weeks.push(cells.slice(start, start + 7));
  }
  return weeks;
}

export function isSelectable(day: string, min?: string, max?: string): boolean {
  return (min === undefined || day >= min) && (max === undefined || day <= max);
}

/** Un mois vaut la peine d'être affiché s'il contient au moins un jour sélectionnable : c'est ce qui décide si les flèches de navigation sont actives. */
export function monthHasSelectable(ref: MonthRef, min?: string, max?: string): boolean {
  return (min === undefined || lastDayOf(ref) >= min) && (max === undefined || firstDayOf(ref) <= max);
}
