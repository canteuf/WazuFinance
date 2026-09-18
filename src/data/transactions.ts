import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type TransactionWithCategory = Tables<'transactions'> & {
  category: { id: string; name: string; icon: string } | null;
};

const SELECT_WITH_CATEGORY = '*, category:categories(id, name, icon)';

/**
 * Dernières opérations du groupe sur une période, les plus récentes d'abord.
 *
 * Les bornes ne sont pas optionnelles : le reste du tableau de bord (solde, entrées, sorties, répartition) décrit une période, et une liste qui remonterait au-delà placerait le loyer du mois dernier sous « Solde de septembre ». Semi-ouvertes [from, to), comme partout ailleurs.
 *
 * Le tri reprend transactions_group_occurred_idx (group_id, occurred_on desc, id desc) : l'index couvre le filtre et l'ordre, et le départage par id rend la pagination de l'écran 3 stable quand plusieurs lignes partagent une date.
 */
export async function listRecent(
  groupId: string,
  limit: number,
  from: string,
  to: string
): Promise<TransactionWithCategory[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(SELECT_WITH_CATEGORY)
    .eq('group_id', groupId)
    .gte('occurred_on', from)
    .lt('occurred_on', to)
    .order('occurred_on', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data;
}

export async function getById(id: string): Promise<TransactionWithCategory> {
  const { data, error } = await supabase
    .from('transactions')
    .select(SELECT_WITH_CATEGORY)
    .eq('id', id)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export type CreateTransactionInput = {
  groupId: string;
  userId: string;
  categoryId: string;
  type: Tables<'transactions'>['type'];
  amount: number;
  occurredOn: string;
  note: string | null;
};

export type UpdateTransactionInput = Omit<CreateTransactionInput, 'groupId' | 'userId'>;

export async function create(
  input: CreateTransactionInput
): Promise<Tables<'transactions'>> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      group_id: input.groupId,
      // La policy transactions_insert_member exige user_id = auth.uid() : cette valeur est vérifiée en base, pas seulement ici.
      user_id: input.userId,
      category_id: input.categoryId,
      type: input.type,
      amount: input.amount,
      occurred_on: input.occurredOn,
      note: input.note,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function update(
  id: string,
  patch: UpdateTransactionInput
): Promise<Tables<'transactions'>> {
  const { data, error } = await supabase
    .from('transactions')
    .update({
      category_id: patch.categoryId,
      type: patch.type,
      amount: patch.amount,
      occurred_on: patch.occurredOn,
      note: patch.note,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function remove(id: string): Promise<void> {
  // .select().single() force une erreur si RLS a filtré la ligne cible (id erroné, appartenance périmée) : sans lui, zéro ligne supprimée serait encore un succès silencieux, contrairement à update().
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .select('id')
    .single();

  if (error) {
    throw error;
  }
}

export type TransactionFilters = {
  /** Bornes de date, `null` des deux côtés pour « Tout ». */
  from: string | null;
  to: string | null;
  categoryId: string | null;
  type: Tables<'transactions'>['type'] | null;
};

/** Dernière ligne rendue par la page précédente. */
export type TransactionCursor = {
  occurredOn: string;
  id: string;
};

/**
 * Une page de l'historique, les plus récentes d'abord.
 *
 * La pagination porte sur le couple `(occurred_on, id)` et non sur un décalage. Avec `.range()`, une insertion entre deux pages décale toutes les suivantes et fait apparaître une ligne deux fois ; une suppression en saute une. Le Realtime insérant pendant le défilement, ce n'est pas une hypothèse.
 *
 * L'invariant est couvert par supabase/tests/transaction_paging_test.sql, dont les fixtures partagent volontairement une date : c'est le seul cas où le départage par `id` compte.
 */
export async function listPage(
  groupId: string,
  filters: TransactionFilters,
  cursor: TransactionCursor | null,
  limit: number
): Promise<TransactionWithCategory[]> {
  let query = supabase
    .from('transactions')
    .select(SELECT_WITH_CATEGORY)
    .eq('group_id', groupId);

  // Bornes semi-ouvertes, comme period_summary : la borne haute est exclue, ce qui supprime la classe de bugs « 30 ou 31 jours ».
  if (filters.from !== null) {
    query = query.gte('occurred_on', filters.from);
  }
  if (filters.to !== null) {
    query = query.lt('occurred_on', filters.to);
  }
  if (filters.categoryId !== null) {
    query = query.eq('category_id', filters.categoryId);
  }
  if (filters.type !== null) {
    query = query.eq('type', filters.type);
  }

  if (cursor !== null) {
    // PostgREST n'exprime pas la comparaison de couples `(a, b) < (c, d)` : ce `or` produit le même prédicat. Les deux valeurs viennent d'une ligne déjà renvoyée par le serveur, jamais d'une saisie.
    query = query.or(
      `occurred_on.lt.${cursor.occurredOn},` +
        `and(occurred_on.eq.${cursor.occurredOn},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query
    .order('occurred_on', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data;
}
