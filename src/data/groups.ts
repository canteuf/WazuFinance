import { supabase } from '@/lib/supabase';
import type { MembershipRole } from '@/types/database';

export type MembershipSummary = {
  groupId: string;
  name: string;
  isPersonal: boolean;
  role: MembershipRole;
  /** Jour du mois où démarre la période budgétaire (1 à 28). 1 = mois calendaire. */
  periodStartDay: number;
};

/**
 * Groupes dont l'utilisateur courant est membre, le compte personnel en tête.
 *
 * Les policies RLS filtrent déjà sur l'appelant : aucun filtre côté client
 * n'est nécessaire, et en ajouter un donnerait la fausse impression que la
 * sécurité vit ici.
 */
export async function listMemberships(): Promise<MembershipSummary[]> {
  const { data, error } = await supabase
    .from('account_memberships')
    .select('role, budget_groups(id, name, is_personal, period_start_day)')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data
    .flatMap((row) => {
      const group = row.budget_groups;
      if (!group) {
        return [];
      }
      return [
        {
          groupId: group.id,
          name: group.name,
          isPersonal: group.is_personal,
          role: row.role,
          periodStartDay: group.period_start_day,
        },
      ];
    })
    .sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal));
}
