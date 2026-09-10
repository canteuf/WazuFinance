import { dateToIso, isoToDate } from '@/lib/dates';
import { formatAmount } from '@/lib/money';
import type { ActivityAction, ActivitySubject, Json } from '@/types/database';

/**
 * Phrases du journal d'activité.
 *
 * Module pur, sans dépendance au framework, couvert par Jest comme `money` et
 * `dates`. `ActivityLogRow` reprend les alias `ActivitySubject` et
 * `ActivityAction` des types générés plutôt que de recopier les mêmes unions :
 * `Tables<'activity_log'>` lui reste assignable.
 */
export type ActivityLogRow = {
  subject: ActivitySubject;
  action: ActivityAction;
  actor_id: string | null;
  actor_name: string | null;
  old_values: Json;
  new_values: Json | null;
  changed_fields: string[];
};

export type CategoryName = { id: string; name: string };

type JsonObject = { [key: string]: Json | undefined };

const UNKNOWN_ACTOR = "Hors de l'app";
const NO_CATEGORY = 'Sans catégorie';
const DELETED_CATEGORY = 'catégorie supprimée';

// Hissés au niveau du module, comme dans dates.ts : construire un
// Intl.DateTimeFormat coûte cher, et leur config ne dépend d'aucun argument.
const dayFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const dayWithYearFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * `old_values` et `new_values` arrivent typés `Json` : une chaîne, un tableau
 * ou `null` y sont possibles en principe. Tout ce qui n'est pas un objet est
 * lu comme un objet vide — la phrase perd ses détails, le fil ne plante pas.
 */
function asObject(value: Json | null): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

function readString(values: JsonObject, key: string): string | null {
  const value = values[key];
  return typeof value === 'string' ? value : null;
}

function readNumber(values: JsonObject, key: string): number | null {
  const value = values[key];
  return typeof value === 'number' ? value : null;
}

/** « 8 sept. » pour une date `YYYY-MM-DD`, `null` pour toute autre valeur. */
function formatDay(iso: string | null): string | null {
  if (iso === null || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }
  return dayFormatter.format(isoToDate(iso));
}

/**
 * Postgres rend de zéro à six décimales de seconde, zéros de fin retirés
 * (« 16:00:00.5 »). Le format ISO d'ECMAScript en attend exactement trois, et
 * Hermes est plus strict que V8 : on ramène toute fraction à trois chiffres —
 * tronquée ou complétée — avant de lire.
 */
function parseTimestamp(value: string): number {
  return Date.parse(
    value.replace(/\.(\d+)/, (_match, digits: string) => `.${digits.slice(0, 3).padEnd(3, '0')}`)
  );
}

function typeLabel(value: string | null): string | null {
  if (value === 'expense') {
    return 'Dépense';
  }
  if (value === 'income') {
    return 'Revenu';
  }
  return null;
}

function quoteNote(note: string | null): string {
  return note ? `« ${note} »` : 'aucune';
}

function categoryLabel(categoryId: string | null, categories: readonly CategoryName[]): string {
  if (categoryId === null) {
    return NO_CATEGORY;
  }
  return categories.find((category) => category.id === categoryId)?.name ?? DELETED_CATEGORY;
}

function actorAndVerb(entry: ActivityLogRow, currentUserId: string | null): string {
  const verb = entry.action === 'update' ? 'modifié' : 'supprimé';
  if (entry.actor_id !== null && entry.actor_id === currentUserId) {
    return `Vous avez ${verb}`;
  }
  return `${entry.actor_name ?? UNKNOWN_ACTOR} a ${verb}`;
}

function amountChange(before: JsonObject, after: JsonObject): string | null {
  const from = readNumber(before, 'amount');
  const to = readNumber(after, 'amount');
  return from === null || to === null ? null : `${formatAmount(from)} € → ${formatAmount(to)} €`;
}

/**
 * Nom d'une opération : le même que dans la liste, sa catégorie — celle
 * d'avant le changement, puisque c'est sous ce nom que les membres la
 * connaissaient —, suivie de la note comme sur la ligne d'information de
 * TransactionRow.
 */
function transactionLabel(before: JsonObject, categories: readonly CategoryName[]): string {
  const name = categoryLabel(readString(before, 'category_id'), categories);
  const note = readString(before, 'note');
  return note ? `${name} · ${note}` : name;
}

/**
 * Détail d'une modification d'opération, dans un ordre fixe. Un champ absent
 * de cette liste est ignoré à l'affichage ; une valeur malformée fait tomber
 * sa seule partie, pas la phrase. Quand la catégorie change, seule la
 * nouvelle est donnée : l'ancienne est déjà dans le nom.
 */
function transactionChanges(
  entry: ActivityLogRow,
  before: JsonObject,
  after: JsonObject,
  categories: readonly CategoryName[]
): string[] {
  const fields = entry.changed_fields;
  const parts: string[] = [];

  if (fields.includes('amount')) {
    const change = amountChange(before, after);
    if (change !== null) {
      parts.push(change);
    }
  }
  if (fields.includes('category_id')) {
    parts.push(`catégorie → ${categoryLabel(readString(after, 'category_id'), categories)}`);
  }
  if (fields.includes('occurred_on')) {
    const from = formatDay(readString(before, 'occurred_on'));
    const to = formatDay(readString(after, 'occurred_on'));
    if (from !== null && to !== null) {
      parts.push(`date ${from} → ${to}`);
    }
  }
  if (fields.includes('type')) {
    const from = typeLabel(readString(before, 'type'));
    const to = typeLabel(readString(after, 'type'));
    if (from !== null && to !== null) {
      parts.push(`type ${from} → ${to}`);
    }
  }
  if (fields.includes('note')) {
    parts.push(`note ${quoteNote(readString(before, 'note'))} → ${quoteNote(readString(after, 'note'))}`);
  }

  return parts;
}

/**
 * Une phrase par entrée. Une entrée sans détail affichable garde sa phrase
 * courte (« Marie a modifié Restaurants ») : un journal de confiance ne cache
 * pas d'entrée.
 */
export function formatActivity(
  entry: ActivityLogRow,
  currentUserId: string | null,
  categories: readonly CategoryName[]
): string {
  const actor = actorAndVerb(entry, currentUserId);
  const before = asObject(entry.old_values);
  const after = asObject(entry.new_values);

  if (entry.subject === 'budget') {
    const name = categoryLabel(readString(before, 'category_id'), categories);

    if (entry.action === 'delete') {
      const amount = readNumber(before, 'amount');
      return amount === null
        ? `${actor} le budget ${name}`
        : `${actor} le budget ${name} (${formatAmount(amount)} €)`;
    }

    const change = entry.changed_fields.includes('amount') ? amountChange(before, after) : null;
    return change === null ? `${actor} le budget ${name}` : `${actor} le plafond ${name} : ${change}`;
  }

  const label = transactionLabel(before, categories);

  if (entry.action === 'delete') {
    const amount = readNumber(before, 'amount');
    const day = formatDay(readString(before, 'occurred_on'));
    const tail = amount !== null && day !== null ? `, ${formatAmount(amount)} € du ${day}` : '';
    return `${actor} ${label}${tail}`;
  }

  const parts = transactionChanges(entry, before, after, categories);
  return parts.length === 0 ? `${actor} ${label}` : `${actor} ${label} : ${parts.join(', ')}`;
}

/** « Aujourd'hui, 14:32 », « Hier, 09:05 », « 8 sept., 09:05 », « 8 sept. 2025, 09:05 ». */
export function formatActivityTime(occurredAt: string, now: Date = new Date()): string {
  const date = new Date(parseTimestamp(occurredAt));
  const time = timeFormatter.format(date);
  const day = dateToIso(date);

  if (day === dateToIso(now)) {
    return `Aujourd'hui, ${time}`;
  }

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day === dateToIso(yesterday)) {
    return `Hier, ${time}`;
  }

  const formatter = date.getFullYear() === now.getFullYear() ? dayFormatter : dayWithYearFormatter;
  return `${formatter.format(date)}, ${time}`;
}

/**
 * Vrai si la ligne a été réellement modifiée depuis sa saisie.
 *
 * Fiable grâce à la base : touch_updated_at() ne bouge plus sur un
 * enregistrement sans changement, et la migration du journal a remis
 * updated_at à created_at sur toutes les lignes existantes. Les deux valeurs
 * sont comparées comme des instants.
 */
export function wasEdited(row: { created_at: string; updated_at: string }): boolean {
  return parseTimestamp(row.updated_at) > parseTimestamp(row.created_at);
}
