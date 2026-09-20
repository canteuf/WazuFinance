/**
 * Dates d'opération.
 *
 * La base stocke du `date` nu (pas de timestamp) : on manipule des chaînes `YYYY-MM-DD` et on évite tout décalage de fuseau en construisant la date locale composant par composant.
 */

export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isoToDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function dateToIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Hissé au niveau du module comme le formateur de src/lib/money.ts : la construction d'un Intl.DateTimeFormat est coûteuse, et sa config ne dépend d'aucun argument d'appel.
const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** « Aujourd'hui », « Hier », sinon « 2 sept. 2026 ». */
export function formatOccurredOn(iso: string): string {
  if (iso === todayIso()) {
    return "Aujourd'hui";
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === dateToIso(yesterday)) {
    return 'Hier';
  }

  return dateFormatter.format(isoToDate(iso));
}

// Hissés au niveau du module pour la même raison que dateFormatter ci-dessus.
const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long' });
const shortDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
});

const monthYearFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

/** « Décembre 2026 » : l'échéance d'un objectif se lit au mois, le jour n'apprend rien. */
export function formatMonthYear(iso: string): string {
  const label = monthYearFormatter.format(isoToDate(iso));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Bornes de la période budgétaire en cours, intervalle semi-ouvert [from, to).
 *
 * `startDay` est le jour du mois où démarre la période (1 à 28, contraint en base). Si le jour courant l'a atteint, la période a commencé ce mois-ci ; sinon elle a commencé le mois dernier. Un salaire tombant le 27 rend la « fin de mois » calendaire dénuée de sens, d'où ce décalage.
 *
 * Le calcul vit ici et non côté serveur : Supabase tourne en UTC, et un `date_trunc` sur `now()` se tromperait de période pendant les premières heures du jour de bascule pour quiconque est à l'est de Greenwich.
 */
export function periodBounds(today: string, startDay: number): { from: string; to: string } {
  const date = isoToDate(today);
  const startedThisMonth = date.getDate() >= startDay;
  const month = date.getMonth() - (startedThisMonth ? 0 : 1);

  // Date normalise les débordements : le mois -1 devient décembre de l'année précédente, le mois 12 janvier de la suivante. Aucun cas limite à écrire.
  return {
    from: dateToIso(new Date(date.getFullYear(), month, startDay)),
    to: dateToIso(new Date(date.getFullYear(), month + 1, startDay)),
  };
}

/**
 * Libellé d'une période, à placer derrière un nom : « Solde » + ce libellé.
 *
 * Démarrage le 1er : la période est un mois calendaire et se nomme par son mois. Sinon elle chevauche deux mois, et seul l'intervalle est exact. `to` étant exclue, la date affichée en fin de période est la veille.
 */
export function formatPeriodLabel(from: string, to: string): string {
  const start = isoToDate(from);
  if (start.getDate() === 1) {
    return `de ${monthFormatter.format(start)}`;
  }

  const last = isoToDate(to);
  last.setDate(last.getDate() - 1);
  return `du ${shortDateFormatter.format(start)} au ${shortDateFormatter.format(last)}`;
}

/**
 * Jour de début de période, pour une phrase : « le 1er », « le 5 ».
 *
 * Le français n'abrège en ordinal que le premier jour du mois ; les autres s'écrivent en chiffres seuls.
 */
export function periodStartDayLabel(day: number): string {
  return day === 1 ? 'le 1er' : `le ${day}`;
}

export type PeriodPresetId = 'current' | 'previous' | 'last3' | 'all';

export type PeriodPreset = {
  id: PeriodPresetId;
  label: string;
  /** null aux deux bornes = aucune limite de date. */
  from: string | null;
  to: string | null;
};

/**
 * Les quatre choix du filtre de période de l'écran 3.
 *
 * Tous calés sur `periodBounds`, donc sur `budget_groups.period_start_day` : « En cours » recouvre exactement les lignes que le solde du tableau de bord additionne. Des préréglages calendaires afficheraient une somme différente dès que le jour de démarrage n'est pas le 1er, sans que rien n'explique l'écart.
 */
export function periodPresets(today: string, startDay: number): PeriodPreset[] {
  const current = periodBounds(today, startDay);

  // La veille du début de la période en cours tombe forcément dans la précédente : on relit les bornes depuis cette date plutôt que de refaire l'arithmétique des mois une seconde fois.
  const dayBefore = isoToDate(current.from);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const previous = periodBounds(dateToIso(dayBefore), startDay);

  // Deux crans en arrière depuis le début de la période en cours en couvre trois avec elle. setMonth est sûr ici : le jour de démarrage est plafonné à 28 en base, et aucun mois n'a moins de 28 jours.
  const thirdBack = isoToDate(current.from);
  thirdBack.setMonth(thirdBack.getMonth() - 2);

  return [
    { id: 'current', label: 'En cours', from: current.from, to: current.to },
    { id: 'previous', label: 'Précédente', from: previous.from, to: previous.to },
    { id: 'last3', label: '3 dernières', from: dateToIso(thirdBack), to: current.to },
    // « Depuis le début » et non « Tout » : la barre de filtres affiche juste en dessous une pastille « Tout » qui désigne le type d'opération. Deux pastilles identiques à deux lignes d'écart, portant deux sens différents, se confondent.
    { id: 'all', label: 'Depuis le début', from: null, to: null },
  ];
}
