import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type Category = Tables<'categories'>;

/**
 * Catégories utilisables dans un groupe : les catégories par défaut (group_id IS NULL, communes à tous et en lecture seule) et celles créées dans le groupe.
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

  return data;
}
