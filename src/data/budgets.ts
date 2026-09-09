import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type BudgetWithCategory = Tables<'budgets'> & {
  category: { id: string; name: string; icon: string };
};

const SELECT_WITH_CATEGORY = '*, category:categories(id, name, icon)';

/**
 * Budgets du groupe, catégorie embarquée.
 *
 * La jointure est faite par PostgREST, comme pour les transactions : une
 * seconde requête sur `categories` obligerait à rapprocher les deux côté
 * client alors que la base sait le faire.
 *
 * Le tri par nom de catégorie n'est pas l'ordre d'affichage final — l'écran
 * remonte les budgets en alerte — mais il rend la lecture brute stable, ce
 * qui compte quand on inspecte la réponse.
 */
export async function listForGroup(groupId: string): Promise<BudgetWithCategory[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select(SELECT_WITH_CATEGORY)
    .eq('group_id', groupId)
    .order('name', { ascending: true, referencedTable: 'categories' });

  if (error) {
    throw error;
  }

  return data;
}

export type CreateBudgetInput = {
  groupId: string;
  categoryId: string;
  amount: number;
};

export type UpdateBudgetInput = {
  amount: number;
};

/**
 * `period` est écrit en dur à 'monthly'.
 *
 * L'enum `budget_period` accepte aussi 'weekly', que la V1 n'expose pas : un
 * budget suit la période budgétaire du groupe (period_start_day), la même que
 * le solde et la répartition. Le jour où l'hebdomadaire arrivera, il faudra
 * une seconde fonction de bornes et une convention de début de semaine — ce
 * n'est pas une valeur à faire remonter dans le formulaire en attendant.
 */
export async function create(input: CreateBudgetInput): Promise<Tables<'budgets'>> {
  const { data, error } = await supabase
    .from('budgets')
    .insert({
      group_id: input.groupId,
      category_id: input.categoryId,
      period: 'monthly',
      amount: input.amount,
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
  patch: UpdateBudgetInput
): Promise<Tables<'budgets'>> {
  const { data, error } = await supabase
    .from('budgets')
    .update({ amount: patch.amount })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function remove(id: string): Promise<void> {
  const { error } = await supabase.from('budgets').delete().eq('id', id);

  if (error) {
    throw error;
  }
}
