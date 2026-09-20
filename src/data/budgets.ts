import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type BudgetWithCategory = Tables<'budgets'> & {
  // Nullable non pas à cause du schéma mais de RLS : rien n'empêche en base qu'un budget pointe une catégorie hors de portée du groupe (seul le sélecteur du formulaire le filtre côté client), et RLS masque alors la ligne jointe. Même situation que `category` dans src/data/transactions.ts.
  category: { id: string; name: string; icon: string } | null;
};

const SELECT_WITH_CATEGORY = '*, category:categories(id, name, icon)';

/**
 * Budgets du groupe, catégorie embarquée.
 *
 * La jointure est faite par PostgREST, comme pour les transactions : une seconde requête sur `categories` obligerait à rapprocher les deux côté client alors que la base sait le faire.
 *
 * L'ordre de lecture suit la date de création. L'ordre d'affichage final vient de `budgetProgress` qui remonte les budgets en alerte.
 */
export async function listForGroup(groupId: string): Promise<BudgetWithCategory[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select(SELECT_WITH_CATEGORY)
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

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

/**
 * `period` est écrit en dur à 'monthly'.
 *
 * L'enum `budget_period` accepte aussi 'weekly', que la V1 n'expose pas : un budget suit la période budgétaire du groupe (period_start_day), la même que le solde et la répartition. Le jour où l'hebdomadaire arrivera, il faudra une seconde fonction de bornes et une convention de début de semaine — ce n'est pas une valeur à faire remonter dans le formulaire en attendant.
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

/**
 * Augmente (`delta` positif) ou réduit (`delta` négatif) le plafond d'une enveloppe.
 *
 * Il n'y a pas de fonction pour réécrire le plafond : dans un budget partagé, deux membres qui ajustent la même enveloppe verraient le second écraser le premier. L'addition se fait en base, dans un seul update, et passe par le journal comme toute modification.
 */
export async function adjust(id: string, delta: number): Promise<Tables<'budgets'>> {
  const { data, error } = await supabase
    .rpc('adjust_budget_amount', { p_budget_id: id, p_delta: delta })
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export type BudgetTotals = {
  /** Dépense de la période dans les seules catégories qui ont une enveloppe. */
  spent: number;
  ceiling: number;
  /** Signé : négatif en dépassement. */
  remaining: number;
};

/**
 * Totaux de toutes les enveloppes du groupe sur la période, sommés par Postgres.
 *
 * La dépense suit la définition de category_breakdown(), que les cartes lisent déjà : le total en tête est la somme exacte des montants affichés dessous.
 */
export async function getTotals(groupId: string, from: string, to: string): Promise<BudgetTotals> {
  const { data, error } = await supabase
    .rpc('budget_totals', { p_group_id: groupId, p_from: from, p_to: to })
    .single();

  if (error) {
    throw error;
  }

  return {
    spent: Number(data.spent),
    ceiling: Number(data.ceiling),
    remaining: Number(data.remaining),
  };
}

export async function remove(id: string): Promise<void> {
  // .select().single() force une erreur si RLS a filtré la ligne cible (id erroné, appartenance périmée) : sans lui, zéro ligne supprimée serait encore un succès silencieux.
  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('id', id)
    .select('id')
    .single();

  if (error) {
    throw error;
  }
}
