import { supabase } from '@/lib/supabase';

export type DeletionBlocker = {
  groupId: string;
  name: string;
};

/**
 * Groupes partagés possédés par l'appelant qui ont encore d'autres membres : tant que la liste n'est pas vide, la suppression du compte est refusée.
 *
 * Même fonction que celle que `delete_own_account()` consulte avant de supprimer : l'écran et la base partagent une seule définition de ce qui bloque.
 */
export async function listDeletionBlockers(): Promise<DeletionBlocker[]> {
  const { data, error } = await supabase.rpc('owned_groups_with_other_members');

  if (error) {
    throw error;
  }

  return data.map((row) => ({ groupId: row.id, name: row.name }));
}

/**
 * Supprime le compte de l'appelant et tout ce qui en dépend, par les cascades en base.
 *
 * Refusée en `P0001` si un groupe partagé possédé a encore d'autres membres ; `data-errors.ts` affiche alors le message verbatim. Ne déconnecte pas : c'est à l'appelant de le faire, en portée locale — voir `AuthProvider.deleteAccount`.
 */
export async function deleteOwnAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_own_account');

  if (error) {
    throw error;
  }
}
