import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type SavingsGoal = Tables<'savings_goals'>;

/**
 * Objectifs de l'utilisateur courant.
 *
 * Pas de filtre `.eq('user_id', …)` : la policy `savings_goals_all_own` (`user_id = auth.uid()`) ne renvoie déjà que les lignes de l'appelant. Un filtre client redondant suggérerait à tort que la sécurité vit ici.
 */
export async function listSavingsGoals(): Promise<SavingsGoal[]> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export type CreateSavingsGoalInput = {
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
};

export type UpdateSavingsGoalInput = {
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
};

export async function createSavingsGoal(input: CreateSavingsGoalInput): Promise<SavingsGoal> {
  const { data, error } = await supabase
    .from('savings_goals')
    .insert({
      // La policy savings_goals_all_own exige user_id = auth.uid() : cette valeur est vérifiée en base, pas seulement ici.
      user_id: input.userId,
      name: input.name,
      target_amount: input.targetAmount,
      current_amount: input.currentAmount,
      target_date: input.targetDate,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateSavingsGoal(
  id: string,
  patch: UpdateSavingsGoalInput
): Promise<SavingsGoal> {
  const { data, error } = await supabase
    .from('savings_goals')
    .update({
      name: patch.name,
      target_amount: patch.targetAmount,
      current_amount: patch.currentAmount,
      target_date: patch.targetDate,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteSavingsGoal(id: string): Promise<void> {
  // .select().single() force une erreur si RLS a filtré la ligne visée (id erroné, appartenance périmée) : sans lui, zéro ligne supprimée serait encore un succès silencieux.
  const { error } = await supabase
    .from('savings_goals')
    .delete()
    .eq('id', id)
    .select('id')
    .single();

  if (error) {
    throw error;
  }
}
