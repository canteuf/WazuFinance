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
  icon: string;
  targetAmount: number;
  /** Ce qui est déjà de côté à la création. Ensuite, le montant ne change plus que par addToSavingsGoal(). */
  currentAmount: number;
  targetDate: string | null;
};

/**
 * Sans `currentAmount`, à dessein : modifier un objectif ne réécrit jamais ce qui est épargné. Un formulaire qui renverrait le montant lu à l'ouverture effacerait un versement fait entre-temps depuis un autre appareil.
 */
export type UpdateSavingsGoalInput = {
  name: string;
  icon: string;
  targetAmount: number;
  targetDate: string | null;
};

export async function createSavingsGoal(input: CreateSavingsGoalInput): Promise<SavingsGoal> {
  const { data, error } = await supabase
    .from('savings_goals')
    .insert({
      // La policy savings_goals_all_own exige user_id = auth.uid() : cette valeur est vérifiée en base, pas seulement ici.
      user_id: input.userId,
      name: input.name,
      icon: input.icon,
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
      icon: patch.icon,
      target_amount: patch.targetAmount,
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

/**
 * Verse (`delta` positif) ou retire (`delta` négatif) sur un objectif.
 *
 * L'addition se fait en base, dans un seul update : lire le montant, l'additionner ici et le renvoyer perdrait un versement concurrent, et passerait par des flottants binaires. Les refus (retrait supérieur à l'épargne, objectif disparu) reviennent en P0001 avec leur message français.
 *
 * La même fonction enregistre le mouvement comme opération d'épargne du compte personnel, qui sort du solde (migration savings_movements). `today` la date : il vient de l'appareil, le serveur étant en UTC.
 *
 * `requestId` identifie le geste et devient l'id de cette opération : un renvoi après une réponse perdue la retrouve au lieu de verser deux fois (migration idempotent_deltas).
 */
export async function addToSavingsGoal(
  id: string,
  delta: number,
  today: string,
  requestId: string
): Promise<SavingsGoal> {
  const { data, error } = await supabase
    .rpc('add_to_savings_goal', {
      p_goal_id: id,
      p_delta: delta,
      p_occurred_on: today,
      p_id: requestId,
    })
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export type SavingsOverview = {
  totalSaved: number;
  /** Somme des rythmes mensuels ci-dessous, faite par Postgres. */
  monthlyEffort: number;
  /** Rythme mensuel par objectif. Absent pour un objectif atteint ou sans échéance. */
  rhythms: Map<string, number>;
};

/**
 * Totaux d'en-tête de l'écran Épargne et rythme de chaque objectif.
 *
 * `today` vient de l'appareil, comme les bornes de période : le serveur est en UTC. Les deux lectures partent ensemble ; le total et les rythmes viennent de la même fonction SQL, donc l'effort affiché en tête est exactement la somme des rythmes des cartes.
 */
export async function getSavingsOverview(today: string): Promise<SavingsOverview> {
  const [overview, plans] = await Promise.all([
    supabase.rpc('savings_overview', { p_today: today }).single(),
    supabase.rpc('savings_plans', { p_today: today }),
  ]);

  if (overview.error) {
    throw overview.error;
  }
  if (plans.error) {
    throw plans.error;
  }

  // Un numeric traverse PostgREST sans garantie d'arriver en nombre JSON : Number() une fois par valeur, jamais dans une addition.
  return {
    totalSaved: Number(overview.data.total_saved),
    monthlyEffort: Number(overview.data.monthly_effort),
    rhythms: new Map(plans.data.map((row) => [row.goal_id, Number(row.monthly_rhythm)])),
  };
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
