import { supabase } from '@/lib/supabase';
import type { WalletKind } from '@/types/database';

export type WalletOverview = {
  id: string;
  name: string;
  kind: WalletKind;
  isDefault: boolean;
  openingBalance: number;
  /** Sommé en base (wallets_overview()) : départ, opérations et transferts. Jamais recalculé ici. */
  balance: number;
};

/** Portefeuilles du groupe avec leur solde, le portefeuille par défaut en tête. */
export async function listWallets(groupId: string): Promise<WalletOverview[]> {
  const { data, error } = await supabase.rpc('wallets_overview', { p_group_id: groupId });

  if (error) {
    throw error;
  }

  // Un numeric traverse PostgREST sans garantie d'arriver en nombre JSON : Number() une fois par valeur, jamais dans une addition.
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    isDefault: row.is_default,
    openingBalance: Number(row.opening_balance),
    balance: Number(row.balance),
  }));
}

export type WalletTransfer = {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  occurredOn: string;
  note: string | null;
};

/** Derniers transferts du groupe, les plus récents d'abord. */
export async function listTransfers(groupId: string, limit: number): Promise<WalletTransfer[]> {
  const { data, error } = await supabase
    .from('wallet_transfers')
    .select('id, from_wallet_id, to_wallet_id, amount, occurred_on, note')
    .eq('group_id', groupId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    id: row.id,
    fromWalletId: row.from_wallet_id,
    toWalletId: row.to_wallet_id,
    amount: Number(row.amount),
    occurredOn: row.occurred_on,
    note: row.note,
  }));
}

export type CreateWalletInput = {
  id: string;
  groupId: string;
  name: string;
  kind: WalletKind;
  /** Ce que le portefeuille contient aujourd'hui : point de départ, pas un revenu. */
  openingBalance: number;
};

export async function createWallet(input: CreateWalletInput): Promise<void> {
  const { error } = await supabase.from('wallets').insert({
    id: input.id,
    group_id: input.groupId,
    name: input.name,
    kind: input.kind,
    opening_balance: input.openingBalance,
  });

  if (error) {
    throw error;
  }
}

export async function updateWallet(
  id: string,
  patch: { name: string; kind: WalletKind }
): Promise<void> {
  const { error } = await supabase
    .from('wallets')
    .update({ name: patch.name, kind: patch.kind })
    .eq('id', id)
    .select('id')
    .single();

  if (error) {
    throw error;
  }
}

/** Aligne le portefeuille sur ce qu'il contient vraiment ; renvoie l'écart corrigé. Voir adjust_wallet_balance(). */
export async function adjustWalletBalance(id: string, actual: number): Promise<number> {
  const { data, error } = await supabase.rpc('adjust_wallet_balance', {
    p_wallet_id: id,
    p_actual: actual,
  });

  if (error) {
    throw error;
  }

  return Number(data);
}

/** Supprime un portefeuille vide. La base refuse le portefeuille par défaut et un portefeuille utilisé (P0001, message affiché tel quel). */
export async function deleteWallet(id: string): Promise<void> {
  const { error } = await supabase.from('wallets').delete().eq('id', id).select('id').single();

  if (error) {
    throw error;
  }
}

export type TransferInput = {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  /** Frais du transfert : deviennent une dépense « Frais mobile money » sur le portefeuille d'origine. 0 sans frais. */
  fee: number;
  occurredOn: string;
  /** Identifiant de l'opération de frais, tiré par l'app pour qu'un renvoi ne la crée pas deux fois. */
  feeTransactionId: string;
  note: string | null;
};

export async function transferBetweenWallets(input: TransferInput): Promise<void> {
  const { error } = await supabase.rpc('transfer_between_wallets', {
    p_id: input.id,
    p_from_wallet_id: input.fromWalletId,
    p_to_wallet_id: input.toWalletId,
    p_amount: input.amount,
    p_occurred_on: input.occurredOn,
    p_fee_transaction_id: input.feeTransactionId,
    p_fee: input.fee,
    p_note: input.note ?? undefined,
  });

  if (error) {
    throw error;
  }
}
