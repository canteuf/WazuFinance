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
