import { formatOccurredOn } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { TransactionType } from '@/types/database';

/**
 * Saisies en file que la base a refusées une fois envoyées : catégorie supprimée entre-temps, accès retiré au groupe, opération modifiée par un autre membre, remboursement devenu trop grand.
 *
 * Elles quittaient la file sur une alerte vague, sans dire laquelle ni la garder : une dépense notée au marché sans réseau pouvait disparaître sans qu'on sache qu'il fallait la refaire. Elles sont maintenant gardées, par compte, dans la liste « À corriger » de la Synthèse, avec de quoi les reprendre.
 *
 * Ce module ne fait que décrire ; le stockage est dans `rejected-writes-store.ts`.
 */

/** Ce qu'il faut pour rouvrir une création refusée dans le formulaire, sous un nouvel identifiant. */
export type RejectedDraft = {
  groupId: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  occurredOn: string;
  note: string | null;
  walletId: string | null;
  tags: string[];
};

export type RejectedWrite = {
  id: string;
  kind: 'create' | 'update' | 'delete' | 'debtPayment';
  /** « Dépense de 5 000 FCFA du 12 sept. », ou ce qu'on sait de l'écriture. */
  summary: string;
  /** Le refus de la base, traduit par data-errors. */
  reason: string;
  rejectedAt: string;
  /** Création : de quoi la refaire. */
  draft?: RejectedDraft;
  /** Modification : l'opération à rouvrir. */
  transactionId?: string;
};

/** Au-delà, les plus anciennes sortent : une liste de corrections qui s'allonge sans fin n'est plus lue. */
export const MAX_REJECTED = 20;

type Variables = Record<string, unknown>;

function asVariables(value: unknown): Variables {
  return typeof value === 'object' && value !== null ? (value as Variables) : {};
}

function amountOf(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function describeEntry(type: unknown, amount: unknown, occurredOn: unknown): string {
  const label = type === 'income' ? 'Revenu' : 'Dépense';
  const value = amountOf(amount);
  const day = typeof occurredOn === 'string' ? formatOccurredOn(occurredOn) : null;
  // formatOccurredOn dit « Aujourd'hui » et « Hier » pour les jours proches : « du Aujourd'hui » ne se dit pas.
  const date =
    day === null ? '' : day === "Aujourd'hui" ? " d'aujourd'hui" : day === 'Hier' ? " d'hier" : ` du ${day}`;
  return value === null ? `${label}${date}` : `${label} de ${formatMoney(value)}${date}`;
}

/**
 * Description d'une écriture refusée, d'après sa clé de mutation et ses variables. `null` pour une écriture qui n'est pas une saisie en file : rien à garder.
 *
 * Les variables viennent du disque et d'une version de l'app peut-être plus ancienne : chaque champ est lu avec prudence.
 */
export function describeRejected(
  mutationKey: readonly unknown[] | undefined,
  rawVariables: unknown,
  reason: string,
  id: string,
  rejectedAt: string
): RejectedWrite | null {
  if (mutationKey?.[0] !== 'transactionWrites') {
    return null;
  }
  const variables = asVariables(rawVariables);
  const base = { id, reason, rejectedAt };

  switch (mutationKey[1]) {
    case 'create': {
      const amount = amountOf(variables.amount);
      const draft: RejectedDraft | undefined =
        typeof variables.groupId === 'string' &&
        (variables.type === 'expense' || variables.type === 'income') &&
        amount !== null &&
        typeof variables.categoryId === 'string' &&
        typeof variables.occurredOn === 'string'
          ? {
              groupId: variables.groupId,
              type: variables.type,
              amount,
              categoryId: variables.categoryId,
              occurredOn: variables.occurredOn,
              note: typeof variables.note === 'string' ? variables.note : null,
              walletId: typeof variables.walletId === 'string' ? variables.walletId : null,
              tags: Array.isArray(variables.tags)
                ? variables.tags.filter((tag): tag is string => typeof tag === 'string')
                : [],
            }
          : undefined;
      return {
        ...base,
        kind: 'create',
        summary: describeEntry(variables.type, variables.amount, variables.occurredOn),
        draft,
      };
    }
    case 'update': {
      const patch = asVariables(variables.patch);
      return {
        ...base,
        kind: 'update',
        summary: `Modification : ${describeEntry(patch.type, patch.amount, patch.occurredOn).toLowerCase()}`,
        transactionId: typeof variables.id === 'string' ? variables.id : undefined,
      };
    }
    case 'delete':
      return { ...base, kind: 'delete', summary: 'Suppression d’une opération' };
    case 'debtPayment': {
      const amount = amountOf(variables.amount);
      return {
        ...base,
        kind: 'debtPayment',
        summary: amount === null ? 'Remboursement' : `Remboursement de ${formatMoney(amount)}`,
      };
    }
    default:
      return null;
  }
}

/** La liste après l'ajout de `entry`, la plus récente en tête, bornée à `MAX_REJECTED`. */
export function withRejected(list: RejectedWrite[], entry: RejectedWrite): RejectedWrite[] {
  return [entry, ...list.filter((item) => item.id !== entry.id)].slice(0, MAX_REJECTED);
}

/** Relit une liste écrite sur le disque, en écartant ce qui n'en a pas la forme. */
export function parseRejected(raw: string | null): RejectedWrite[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is RejectedWrite =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as RejectedWrite).id === 'string' &&
            typeof (item as RejectedWrite).summary === 'string'
        )
      : [];
  } catch {
    return [];
  }
}
