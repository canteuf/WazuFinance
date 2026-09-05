/**
 * Dates d'opération.
 *
 * La base stocke du `date` nu (pas de timestamp) : on manipule des chaînes
 * `YYYY-MM-DD` et on évite tout décalage de fuseau en construisant la date
 * locale composant par composant.
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

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(isoToDate(iso));
}
