import { dateToIso, isoToDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { ActivityAction, ActivitySubject, Json } from '@/types/database';

/**
 * Phrases du journal d'activité.
 *
 * Module pur, sans dépendance au framework, couvert par Jest comme `money` et `dates`. `ActivityLogRow` reprend les alias `ActivitySubject` et `ActivityAction` des types générés plutôt que de recopier les mêmes unions : `Tables<'activity_log'>` lui reste assignable.
 */
export type ActivityLogRow = {
  subject: ActivitySubject;
  action: ActivityAction;
  actor_id: string | null;
  actor_name: string | null;
  /** `null` pour une création. */
  old_values: Json | null;
  new_values: Json | null;
  changed_fields: string[];
};

export type CategoryName = { id: string; name: string };

type JsonObject = { [key: string]: Json | undefined };

const UNKNOWN_ACTOR = "Hors de l'app";
const NO_CATEGORY = 'Sans catégorie';
const DELETED_CATEGORY = 'catégorie supprimée';

// Hissés au niveau du module, comme dans dates.ts : construire un Intl.DateTimeFormat coûte cher, et leur config ne dépend d'aucun argument.
const dayFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const dayWithYearFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * `old_values` et `new_values` arrivent typés `Json` : une chaîne, un tableau ou `null` y sont possibles en principe. Tout ce qui n'est pas un objet est lu comme un objet vide — la phrase perd ses détails, le fil ne plante pas.
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
 * Postgres rend de zéro à six décimales de seconde, zéros de fin retirés (« 16:00:00.5 »). Le format ISO d'ECMAScript en attend exactement trois, et Hermes est plus strict que V8 : on ramène toute fraction à trois chiffres — tronquée ou complétée — avant de lire.
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

function defaultVerb(action: ActivityAction): string {
  if (action === 'insert') {
    return 'ajouté';
  }
  return action === 'update' ? 'modifié' : 'supprimé';
}

function isCurrentUser(userId: string | null, currentUserId: string | null): boolean {
  return userId !== null && userId === currentUserId;
}

/** « Vous avez ajouté », « Marie a supprimé ». */
function actorAndVerb(
  entry: ActivityLogRow,
  currentUserId: string | null,
  verb: string = defaultVerb(entry.action)
): string {
  if (isCurrentUser(entry.actor_id, currentUserId)) {
    return `Vous avez ${verb}`;
  }
  return `${entry.actor_name ?? UNKNOWN_ACTOR} a ${verb}`;
}

function amountChange(before: JsonObject, after: JsonObject): string | null {
  const from = readNumber(before, 'amount');
  const to = readNumber(after, 'amount');
  return from === null || to === null ? null : `${formatMoney(from)} → ${formatMoney(to)}`;
}

/**
 * Nom d'une opération : le même que dans la liste, sa catégorie — celle d'avant le changement, puisque c'est sous ce nom que les membres la connaissaient —, suivie de la note comme sur la ligne d'information de TransactionRow.
 *
 * Un mouvement d'épargne ou de prêt n'a pas de catégorie : il se nomme comme sur sa ligne, « Épargne » ou sa note (« Remboursement de Cousin »), plutôt que « Sans catégorie ».
 */
function transactionLabel(before: JsonObject, categories: readonly CategoryName[]): string {
  const note = readString(before, 'note');
  if (before.is_savings === true) {
    return note ? `Épargne · ${note}` : 'Épargne';
  }
  if (readString(before, 'debt_id') !== null && note) {
    return note;
  }
  const name = categoryLabel(readString(before, 'category_id'), categories);
  return note ? `${name} · ${note}` : name;
}

/**
 * Détail d'une modification d'opération, dans un ordre fixe. Un champ absent de cette liste est ignoré à l'affichage ; une valeur malformée fait tomber sa seule partie, pas la phrase. Quand la catégorie change, seule la nouvelle est donnée : l'ancienne est déjà dans le nom.
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
 * Ce que le journal ne porte pas lui-même et que l'écran connaît : le nom des personnes (membres actuels et anciens, par identifiant) et celui des portefeuilles. Une entrée qui cite un inconnu garde sa phrase, avec un nom générique.
 */
export type ActivityContext = {
  names?: ReadonlyMap<string, string>;
  wallets?: readonly { id: string; name: string }[];
};

/** « 10 000 FCFA » entre parenthèses, ou rien quand le montant manque. */
function amountTail(values: JsonObject): string {
  const amount = readNumber(values, 'amount');
  return amount === null ? '' : ` (${formatMoney(amount)})`;
}

function formatTransaction(
  entry: ActivityLogRow,
  currentUserId: string | null,
  categories: readonly CategoryName[],
  before: JsonObject,
  after: JsonObject
): string {
  const actor = actorAndVerb(entry, currentUserId);

  if (entry.action === 'insert' || entry.action === 'delete') {
    const values = entry.action === 'insert' ? after : before;
    const label = transactionLabel(values, categories);
    const amount = readNumber(values, 'amount');
    const day = formatDay(readString(values, 'occurred_on'));
    const tail = amount !== null && day !== null ? `, ${formatMoney(amount)} du ${day}` : '';
    return `${actor} ${label}${tail}`;
  }

  const label = transactionLabel(before, categories);
  const parts = transactionChanges(entry, before, after, categories);
  return parts.length === 0 ? `${actor} ${label}` : `${actor} ${label} : ${parts.join(', ')}`;
}

function formatBudget(
  entry: ActivityLogRow,
  currentUserId: string | null,
  categories: readonly CategoryName[],
  before: JsonObject,
  after: JsonObject
): string {
  if (entry.action === 'insert') {
    const name = categoryLabel(readString(after, 'category_id'), categories);
    return `${actorAndVerb(entry, currentUserId, 'créé')} le budget ${name}${amountTail(after)}`;
  }

  const actor = actorAndVerb(entry, currentUserId);
  const name = categoryLabel(readString(before, 'category_id'), categories);

  if (entry.action === 'delete') {
    return `${actor} le budget ${name}${amountTail(before)}`;
  }

  const change = entry.changed_fields.includes('amount') ? amountChange(before, after) : null;
  return change === null ? `${actor} le budget ${name}` : `${actor} le plafond ${name} : ${change}`;
}

/** « le prêt à Cousin », « l'emprunt à Tante Awa », « la vente à crédit à Mama Ngo ». */
function debtLabel(values: JsonObject): string {
  const counterparty = readString(values, 'counterparty') ?? 'un proche';
  switch (readString(values, 'direction')) {
    case 'borrowed':
      return `l’emprunt à ${counterparty}`;
    case 'credit_sale':
      return `la vente à crédit à ${counterparty}`;
    default:
      return `le prêt à ${counterparty}`;
  }
}

function formatDebt(
  entry: ActivityLogRow,
  currentUserId: string | null,
  before: JsonObject,
  after: JsonObject
): string {
  if (entry.action === 'insert') {
    return `${actorAndVerb(entry, currentUserId, 'noté')} ${debtLabel(after)}${amountTail(after)}`;
  }
  if (entry.action === 'delete') {
    return `${actorAndVerb(entry, currentUserId)} ${debtLabel(before)}${amountTail(before)}`;
  }

  const parts: string[] = [];
  if (entry.changed_fields.includes('counterparty')) {
    parts.push(`nom → ${readString(after, 'counterparty') ?? '…'}`);
  }
  if (entry.changed_fields.includes('due_on')) {
    parts.push(`échéance → ${formatDay(readString(after, 'due_on')) ?? 'aucune'}`);
  }
  if (entry.changed_fields.includes('note')) {
    parts.push(`note ${quoteNote(readString(before, 'note'))} → ${quoteNote(readString(after, 'note'))}`);
  }
  const head = `${actorAndVerb(entry, currentUserId)} ${debtLabel(before)}`;
  return parts.length === 0 ? head : `${head} : ${parts.join(', ')}`;
}

function formatWallet(
  entry: ActivityLogRow,
  currentUserId: string | null,
  before: JsonObject,
  after: JsonObject
): string {
  if (entry.action === 'insert') {
    return `${actorAndVerb(entry, currentUserId, 'créé')} le portefeuille ${readString(after, 'name') ?? '…'}`;
  }

  const name = readString(before, 'name') ?? '…';
  if (entry.action === 'delete') {
    return `${actorAndVerb(entry, currentUserId)} le portefeuille ${name}`;
  }

  const parts: string[] = [];
  if (entry.changed_fields.includes('name')) {
    parts.push(`nom → ${readString(after, 'name') ?? '…'}`);
  }
  if (entry.changed_fields.includes('opening_balance')) {
    const from = readNumber(before, 'opening_balance');
    const to = readNumber(after, 'opening_balance');
    if (from !== null && to !== null) {
      parts.push(`solde de départ ${formatMoney(from)} → ${formatMoney(to)}`);
    }
  }
  const head = `${actorAndVerb(entry, currentUserId)} le portefeuille ${name}`;
  return parts.length === 0 ? head : `${head} : ${parts.join(', ')}`;
}

function formatTransfer(
  entry: ActivityLogRow,
  currentUserId: string | null,
  after: JsonObject,
  context: ActivityContext
): string {
  const walletName = (key: string) =>
    context.wallets?.find((wallet) => wallet.id === readString(after, key))?.name ?? 'un portefeuille';
  const amount = readNumber(after, 'amount');
  return `${actorAndVerb(entry, currentUserId, 'transféré')} ${amount === null ? 'de l’argent' : formatMoney(amount)} de ${walletName('from_wallet_id')} vers ${walletName('to_wallet_id')}`;
}

/**
 * Arrivées, départs, exclusions, changements de rôle. La personne concernée est `user_id` de l'adhésion ; son nom vient du contexte, puisque le journal ne garde que celui de l'auteur.
 */
function formatMembership(
  entry: ActivityLogRow,
  currentUserId: string | null,
  before: JsonObject,
  after: JsonObject,
  context: ActivityContext
): string {
  const values = entry.action === 'insert' ? after : before;
  const targetId = readString(values, 'user_id');
  const targetIsMe = isCurrentUser(targetId, currentUserId);
  const targetName = targetIsMe
    ? 'vous'
    : ((targetId !== null ? context.names?.get(targetId) : undefined) ?? 'un membre');
  const Target = targetIsMe ? 'Vous' : targetName;
  // L'auteur est la personne concernée : elle a rejoint ou quitté d'elle-même. Un auteur absent (compte supprimé, cascade) vaut aussi pour un départ de soi.
  const selfAction = entry.actor_id === targetId || entry.actor_id === null;

  if (entry.action === 'insert') {
    const asViewer = readString(after, 'role') === 'viewer' ? ' en lecteur' : '';
    if (selfAction) {
      return targetIsMe ? `Vous avez rejoint le groupe${asViewer}` : `${Target} a rejoint le groupe${asViewer}`;
    }
    return `${actorAndVerb(entry, currentUserId, 'ajouté')} ${targetName}${asViewer}`;
  }

  if (entry.action === 'delete') {
    if (selfAction) {
      return targetIsMe ? 'Vous avez quitté le groupe' : `${Target} a quitté le groupe`;
    }
    return `${actorAndVerb(entry, currentUserId, 'exclu')} ${targetName}`;
  }

  const from = readString(before, 'role');
  const to = readString(after, 'role');
  if (to === 'owner') {
    return `${actorAndVerb(entry, currentUserId, 'confié le groupe à')} ${targetName}`;
  }
  const change = `${roleWord(from)} → ${roleWord(to)}`;
  if (entry.actor_id === targetId) {
    return `${actorAndVerb(entry, currentUserId, 'changé son rôle')} : ${change}`;
  }
  return `${actorAndVerb(entry, currentUserId, 'changé le rôle de')} ${targetName} : ${change}`;
}

function roleWord(role: string | null): string {
  if (role === 'owner') {
    return 'propriétaire';
  }
  return role === 'viewer' ? 'lecteur' : 'membre';
}

/**
 * Une phrase par entrée. Une entrée sans détail affichable garde sa phrase courte (« Marie a modifié Restaurants ») : un journal de confiance ne cache pas d'entrée.
 */
export function formatActivity(
  entry: ActivityLogRow,
  currentUserId: string | null,
  categories: readonly CategoryName[],
  context: ActivityContext = {}
): string {
  const before = asObject(entry.old_values);
  const after = asObject(entry.new_values);

  switch (entry.subject) {
    case 'budget':
      return formatBudget(entry, currentUserId, categories, before, after);
    case 'debt':
      return formatDebt(entry, currentUserId, before, after);
    case 'wallet':
      return formatWallet(entry, currentUserId, before, after);
    case 'transfer':
      return formatTransfer(entry, currentUserId, after, context);
    case 'membership':
      return formatMembership(entry, currentUserId, before, after, context);
    default:
      return formatTransaction(entry, currentUserId, categories, before, after);
  }
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

/** « 8 sept. 2026, 09:05 » : la date complète, pour un document relu hors de l'app, où « Hier » ne voudrait plus rien dire. */
export function formatActivityDate(occurredAt: string): string {
  const date = new Date(parseTimestamp(occurredAt));
  return `${dayWithYearFormatter.format(date)}, ${timeFormatter.format(date)}`;
}

/**
 * Vrai si la ligne a été réellement modifiée depuis sa saisie.
 *
 * Fiable grâce à la base : touch_updated_at() ne bouge plus sur un enregistrement sans changement, et la migration du journal a remis updated_at à created_at sur toutes les lignes existantes. Les deux valeurs sont comparées comme des instants.
 */
export function wasEdited(row: { created_at: string; updated_at: string }): boolean {
  return parseTimestamp(row.updated_at) > parseTimestamp(row.created_at);
}
