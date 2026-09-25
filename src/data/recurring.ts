import { supabase } from '@/lib/supabase';
import type { RecurrenceFrequency, Tables, TransactionType } from '@/types/database';

export type RecurringWithCategory = Tables<'recurring_transactions'> & {
  category: { id: string; name: string; icon: string } | null;
};

const SELECT_WITH_CATEGORY = '*, category:categories(id, name, icon)';

/** Modèles récurrents du groupe, la prochaine échéance d'abord. */
export async function listForGroup(groupId: string): Promise<RecurringWithCategory[]> {
  const { data, error } = await supabase
    .from('recurring_transactions')
    .select(SELECT_WITH_CATEGORY)
    .eq('group_id', groupId)
    .order('next_due_on', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export type CreateRecurringInput = {
  groupId: string;
  userId: string;
  categoryId: string;
  type: TransactionType;
  amount: number;
  note: string | null;
  frequency: RecurrenceFrequency;
  anchorDay: number;
  /** Première échéance, calculée par nextDueAfter() : la contrainte recurring_anchor_matches refuse une date qui ne tombe pas sur `anchorDay`. */
  nextDueOn: string;
};

export async function createRecurring(input: CreateRecurringInput): Promise<void> {
  const { error } = await supabase.from('recurring_transactions').insert({
    group_id: input.groupId,
    // La policy recurring_transactions_insert_member exige user_id = auth.uid() : vérifié en base.
    user_id: input.userId,
    category_id: input.categoryId,
    type: input.type,
    amount: input.amount,
    note: input.note,
    frequency: input.frequency,
    anchor_day: input.anchorDay,
    next_due_on: input.nextDueOn,
  });

  if (error) {
    throw error;
  }
}

export type ConfirmRecurringInput = {
  id: string;
  /** L'échéance affichée : la base refuse la confirmation si un autre membre l'a déjà traitée. */
  dueOn: string;
  /** Tiré par l'app, pour qu'un renvoi ne crée pas de doublon (même principe que la saisie ordinaire). */
  transactionId: string;
  /** Montant de cette fois, s'il diffère du modèle ; `null` reprend celui du modèle. */
  amount: number | null;
  /** Date de l'appareil : le serveur est en UTC. */
  occurredOn: string;
};

/** Enregistre une échéance comme opération et avance le modèle. Voir confirm_recurring(). */
export async function confirmRecurring(input: ConfirmRecurringInput): Promise<void> {
  const { error } = await supabase.rpc('confirm_recurring', {
    p_id: input.id,
    p_due_on: input.dueOn,
    p_transaction_id: input.transactionId,
    // `undefined` et non `null` : l'argument est alors omis, et la valeur par défaut de la fonction s'applique.
    p_amount: input.amount ?? undefined,
    p_occurred_on: input.occurredOn,
  });

  if (error) {
    throw error;
  }
}

/** Passe une échéance sans rien enregistrer. Voir skip_recurring(). */
export async function skipRecurring(id: string, dueOn: string): Promise<void> {
  const { error } = await supabase.rpc('skip_recurring', { p_id: id, p_due_on: dueOn });

  if (error) {
    throw error;
  }
}

export async function removeRecurring(id: string): Promise<void> {
  // .select().single() force une erreur si RLS a filtré la ligne visée : zéro ligne supprimée ne doit pas passer pour un succès.
  const { error } = await supabase
    .from('recurring_transactions')
    .delete()
    .eq('id', id)
    .select('id')
    .single();

  if (error) {
    throw error;
  }
}
