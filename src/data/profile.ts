import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  email: string;
  displayName: string;
};

/** Profil de l'utilisateur. `userId` est passé explicitement, jamais relu par `getUser()` : c'est la convention de la couche données. */
export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, display_name')
    .eq('id', userId)
    .single();

  if (error) {
    throw error;
  }

  return { id: data.id, email: data.email, displayName: data.display_name };
}

/**
 * Seul `display_name` est modifiable : un privilège par colonne le garantit en base, l'email restant la copie de `auth.users`.
 *
 * `.select('id').single()` force une erreur si RLS filtre la ligne, au lieu d'une réussite silencieuse sur zéro ligne — même précédent que `removeMember`.
 */
export async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ display_name: displayName.trim() })
    .eq('id', userId)
    .select('id')
    .single();

  if (error) {
    throw error;
  }
}
