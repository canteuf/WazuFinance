import type { AvatarId } from '@/lib/avatars';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  email: string;
  displayName: string;
  /** Valeur brute de `users.avatar`, `null` pour les initiales. À passer par `parseAvatarId` avant d'en faire une image. */
  avatar: string | null;
};

/** Profil de l'utilisateur. `userId` est passé explicitement, jamais relu par `getUser()` : c'est la convention de la couche données. */
export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, display_name, avatar')
    .eq('id', userId)
    .single();

  if (error) {
    throw error;
  }

  return { id: data.id, email: data.email, displayName: data.display_name, avatar: data.avatar };
}

/**
 * Choisit l'avatar, ou `null` pour revenir aux initiales.
 *
 * Le paramètre est un `AvatarId` et non un `string` : le client n'écrit que ce qu'il sait dessiner. La base refuse de toute façon ce qui n'a pas le format `a` + deux chiffres (`users_avatar_format`), mais pas un identifiant bien formé que l'app ne connaît pas.
 *
 * Même garde que `updateDisplayName` : `.select('id').single()` force une erreur si RLS filtre la ligne.
 */
export async function updateAvatar(userId: string, avatar: AvatarId | null): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ avatar })
    .eq('id', userId)
    .select('id')
    .single();

  if (error) {
    throw error;
  }
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
