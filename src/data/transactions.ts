import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type TransactionWithCategory = Tables<'transactions'> & {
  category: { id: string; name: string; icon: string } | null;
};

const SELECT_WITH_CATEGORY = '*, category:categories(id, name, icon)';

/**
 * Dernières opérations du groupe, les plus récentes d'abord.
 *
 * Le tri reprend transactions_group_occurred_idx (group_id, occurred_on desc,
 * id desc) : l'index couvre le filtre et l'ordre, et le départage par id rend
 * la pagination de l'écran 3 stable quand plusieurs lignes partagent une date.
 */
export async function listRecent(
  groupId: string,
  limit: number
): Promise<TransactionWithCategory[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(SELECT_WITH_CATEGORY)
    .eq('group_id', groupId)
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
      // La policy transactions_insert_member exige user_id = auth.uid() : cette
      // valeur est vérifiée en base, pas seulement ici.
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
  const { error } = await supabase.from('transactions').delete().eq('id', id);

  if (error) {
    throw error;
  }
}
