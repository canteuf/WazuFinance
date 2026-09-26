import { supabase } from '@/lib/supabase';
import type { DebtDirection } from '@/types/database';

export type DebtOverview = {
  id: string;
  direction: DebtDirection;
  counterparty: string;
  amount: number;
  paid: number;
  /** Ce qui reste dû, sommé en base : jamais calculé ici à partir de `amount` et `paid`. */
  remaining: number;
  dueOn: string | null;
  note: string | null;
  createdAt: string;
};

/**
 * Dettes du groupe avec leur reste dû, les dettes en cours d'abord, les plus proches de leur échéance en tête. Voir debts_overview().
 */
export async function listDebts(groupId: string): Promise<DebtOverview[]> {
  const { data, error } = await supabase.rpc('debts_overview', { p_group_id: groupId });

  if (error) {
    throw error;
  }

  // Un numeric traverse PostgREST sans garantie d'arriver en nombre JSON : Number() une fois par valeur, jamais dans une addition.
  return data.map((row) => ({
    id: row.id,
    direction: row.direction,
    counterparty: row.counterparty,
    amount: Number(row.amount),
    paid: Number(row.paid),
    remaining: Number(row.remaining),
    dueOn: row.due_on,
    note: row.note,
    createdAt: row.created_at,
  }));
}

export type DebtTotals = {
  /** Ce que l'on doit encore au groupe (prêts accordés, non remboursés). */
  owedToUs: number;
  /** Ce que le groupe doit encore (emprunts, non remboursés). */
  weOwe: number;
  /** Dettes pas encore soldées, dans les deux sens. */
  openCount: number;
};

export async function getDebtTotals(groupId: string): Promise<DebtTotals> {
  const { data, error } = await supabase.rpc('debts_totals', { p_group_id: groupId }).single();

  if (error) {
    throw error;
  }

  return {
    owedToUs: Number(data.owed_to_us),
    weOwe: Number(data.we_owe),
    openCount: Number(data.open_count),
  };
}

export type CreateDebtInput = {
  /** Tiré par l'app, comme `transactionId` : un renvoi retrouve la dette au lieu d'en créer une seconde. */
  id: string;
  groupId: string;
  direction: DebtDirection;
  counterparty: string;
  amount: number;
  dueOn: string | null;
  note: string | null;
  /** Date de l'appareil : le serveur est en UTC. */
  occurredOn: string;
  transactionId: string;
  /** Portefeuille d'où sort le prêt ou où entre l'emprunt ; `null` : celui par défaut du groupe. Sans objet pour une vente à crédit. */
  walletId: string | null;
};

/** Crée la dette et son premier mouvement d'argent — aucun pour une vente à crédit. Voir create_debt(). */
export async function createDebt(input: CreateDebtInput): Promise<void> {
  const { error } = await supabase.rpc('create_debt', {
    p_id: input.id,
    p_group_id: input.groupId,
    p_direction: input.direction,
    p_counterparty: input.counterparty,
    p_amount: input.amount,
    p_occurred_on: input.occurredOn,
    p_transaction_id: input.transactionId,
    // `undefined` et non `null` : l'argument est alors omis, et sa valeur par défaut (NULL) s'applique.
    p_due_on: input.dueOn ?? undefined,
    p_note: input.note ?? undefined,
    p_wallet_id: input.walletId ?? undefined,
  });

  if (error) {
    throw error;
  }
}

export type RecordDebtPaymentInput = {
  debtId: string;
  amount: number;
  occurredOn: string;
  transactionId: string;
  /** Absent d'un remboursement mis en file par une version antérieure : vaut `null`. */
  walletId?: string | null;
};

/** Enregistre un remboursement, partiel ou total. Voir record_debt_payment(). */
export async function recordDebtPayment(input: RecordDebtPaymentInput): Promise<void> {
  const { error } = await supabase.rpc('record_debt_payment', {
    p_debt_id: input.debtId,
    p_amount: input.amount,
    p_occurred_on: input.occurredOn,
    p_transaction_id: input.transactionId,
    p_wallet_id: input.walletId ?? undefined,
  });

  if (error) {
    throw error;
  }
}

/** Supprime une dette saisie par erreur, avec ses mouvements (on delete cascade) : ils quittent le solde. */
export async function deleteDebt(id: string): Promise<void> {
  // .select().single() force une erreur si RLS a filtré la ligne visée : zéro ligne supprimée ne doit pas passer pour un succès.
  const { error } = await supabase.from('debts').delete().eq('id', id).select('id').single();

  if (error) {
    throw error;
  }
}
