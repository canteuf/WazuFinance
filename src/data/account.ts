import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

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

/**
 * Toutes les données de l'appelant, en un document JSON (droit d'accès et portabilité).
 *
 * Calculé par `export_my_data()` : son compte personnel en entier, ses propres saisies dans les budgets partagés, ses objectifs d'épargne. Les policies s'appliquent, la fonction étant `SECURITY INVOKER`.
 */
export async function exportMyData(): Promise<Json> {
  const { data, error } = await supabase.rpc('export_my_data');

  if (error) {
    throw error;
  }

  return data;
}

/** Les seuls événements d'usage enregistrés ; l'inscription, la première opération et l'adhésion à un groupe se lisent dans leurs propres tables. */
export type ProductEvent = 'app_opened' | 'invite_shared';

/**
 * Enregistre un événement d'usage pour l'appelant, au plus une fois par jour et par type : la base date elle-même l'événement et ignore les répétitions.
 *
 * Ne lève jamais : une mesure perdue (hors ligne, réseau coupé) ne doit ni bloquer ni alerter l'utilisateur.
 */
export async function logProductEvent(event: ProductEvent): Promise<void> {
  try {
    await supabase.rpc('log_product_event', { p_event: event });
  } catch {
    // Sans conséquence : voir ci-dessus.
  }
}
