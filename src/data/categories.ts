import { hideShadowedDefaults } from '@/lib/category-name';
import { supabase } from '@/lib/supabase';
import type { Tables, TransactionType } from '@/types/database';

export type Category = Tables<'categories'>;

/**
 * Catégories utilisables dans un groupe : les catégories par défaut (group_id IS NULL, communes à tous et en lecture seule) et celles créées dans le groupe. Une catégorie par défaut recouverte par une catégorie du groupe du même nom n'est pas renvoyée (voir hideShadowedDefaults).
 */
export async function listForGroup(groupId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .or(`group_id.is.null,group_id.eq.${groupId}`)
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return hideShadowedDefaults(data);
}

export type CreateCategoryInput = {
  groupId: string;
  name: string;
  icon: string;
  type: TransactionType;
};

/**
 * Crée une catégorie dans un groupe. Le nom arrive déjà normalisé (`normalizeCategoryName`) : la contrainte en base refuse un nom non rogné plutôt que de le corriger.
 */
export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ group_id: input.groupId, name: input.name, icon: input.icon, type: input.type })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export type CategoryPatch = {
  name: string;
  icon: string;
};

/**
 * Renomme une catégorie du groupe ou change son icône : les deux seules colonnes que les clients peuvent modifier (20260924000100_custom_categories.sql). Le trigger categories_guard_homonym refuse un nom déjà pris avec un message affiché tel quel.
 */
export async function updateCategory(id: string, patch: CategoryPatch): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .update({ name: patch.name, icon: patch.icon })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/** Ce qu'une catégorie porte : ce que sa suppression emporte ou reporte. */
export type CategoryUsage = {
  transactions: number;
  budgets: number;
  recurring: number;
};

/**
 * Usage de chaque catégorie propre au groupe, par identifiant. Compté en base (category_usage()) : l'historique est paginé, le client n'a jamais toutes les opérations sous la main.
 */
export async function getCategoryUsage(groupId: string): Promise<Map<string, CategoryUsage>> {
  const { data, error } = await supabase.rpc('category_usage', { p_group_id: groupId });

  if (error) {
    throw error;
  }

  return new Map(
    data.map((row) => [
      row.category_id,
      { transactions: Number(row.transactions), budgets: Number(row.budgets), recurring: Number(row.recurring) },
    ])
  );
}

/**
 * Supprime une catégorie du groupe. Avec `replacementId`, ses opérations et ses modèles récurrents passent d'abord sur cette catégorie, dans la même transaction (delete_category()) ; sans, ils restent sans catégorie. Son budget part avec elle dans les deux cas.
 */
export async function deleteCategory(id: string, replacementId: string | null): Promise<void> {
  const { error } = await supabase.rpc('delete_category', {
    p_id: id,
    p_replacement_id: replacementId ?? undefined,
  });

  if (error) {
    throw error;
  }
}
