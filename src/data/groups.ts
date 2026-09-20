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
 * Filtré par `user_id` : `account_memberships_select_member` autorise à voir toutes les lignes des groupes dont l'appelant est membre, pas seulement la sienne (nécessaire à `listGroupMembers`) — sans ce filtre, un groupe partagé à plusieurs membres renvoie une ligne par membre au lieu d'une par groupe. Resté invisible tant qu'aucun groupe partagé réel n'existait.
 */
export async function listMemberships(userId: string): Promise<MembershipSummary[]> {
  const { data, error } = await supabase
    .from('account_memberships')
    .select('role, budget_groups(id, name, is_personal, period_start_day)')
    .eq('user_id', userId)
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

export type GroupOverview = {
  memberCount: number;
  /** Total des plafonds mensuels du groupe, sommé par Postgres. */
  monthlyBudget: number;
  /** Les trois premiers membres arrivés ; `memberCount` dit s'il y en a d'autres. */
  memberNames: string[];
};

export type GroupOverviews = {
  byGroup: Map<string, GroupOverview>;
  /** Total des plafonds mensuels des groupes partagés, compte personnel exclu. */
  sharedMonthlyTotal: number;
};

/**
 * Chiffres de l'écran « Mes groupes », en un appel pour tous les groupes.
 *
 * Toutes les sommes sont faites par `group_overviews()` sur du numeric : `Number()` n'est appliqué qu'une fois par total, jamais dans une boucle d'addition.
 */
export async function getGroupOverviews(): Promise<GroupOverviews> {
  const { data, error } = await supabase.rpc('group_overviews');

  if (error) {
    throw error;
  }

  return {
    byGroup: new Map(
      data.map((row) => [
        row.group_id,
        {
          memberCount: row.member_count,
          monthlyBudget: Number(row.monthly_budget),
          memberNames: row.member_names,
        },
      ])
    ),
    // Répété sur chaque ligne par la fonction de fenêtre ; zéro quand l'appelant n'a aucune ligne, ce qui n'arrive pas en pratique puisque tout utilisateur a son compte personnel.
    sharedMonthlyTotal: data.length > 0 ? Number(data[0].shared_monthly_total) : 0,
  };
}

export type GroupMember = {
  userId: string;
  displayName: string;
  email: string;
  role: MembershipRole;
};

/**
 * Membres d'un groupe, avec leur rôle.
 *
 * Filtré par `group_id` : la policy `account_memberships_select_member` ne restreint qu'aux groupes dont l'appelant est membre, elle ne réduit pas à un seul groupe à la fois — le filtre explicite reste nécessaire ici.
 */
export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('account_memberships')
    .select('role, users(id, display_name, email)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data.flatMap((row) => {
    const user = row.users;
    if (!user) {
      return [];
    }
    return [
      {
        userId: user.id,
        displayName: user.display_name,
        email: user.email,
        role: row.role,
      },
    ];
  });
}

/**
 * Crée un groupe partagé et sa ligne d'adhésion `owner`, de façon atomique.
 *
 * Passe par la RPC `create_shared_group` plutôt qu'un double INSERT direct : `account_memberships_insert_owner` exige déjà `is_group_owner(group_id)`, qui ne peut jamais être vrai pour la toute première ligne d'un groupe.
 */
export async function createSharedGroup(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_shared_group', { name });

  if (error) {
    throw error;
  }

  return data;
}

/** Rejoint un groupe partagé par son code d'invitation. Voir join_group_with_code(). */
export async function joinGroupWithCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_group_with_code', { invitation_code: code });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Retire un membre d'un groupe — exclusion par le propriétaire, ou départ volontaire quand `userId` est celui de l'appelant. Une seule fonction : `account_memberships_delete_owner_or_self` décide déjà qui a le droit.
 *
 * `.select('id').single()` force une erreur si RLS ou la garde anti-orphelin ont filtré/refusé la ligne visée, même précédent que `deleteSavingsGoal`.
 */
export async function removeMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('account_memberships')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .select('id')
    .single();

  if (error) {
    throw error;
  }
}

/**
 * Règle le jour où démarre la période budgétaire du groupe. La contrainte `between 1 and 28` vit en base ; `budget_groups_update_owner` n'autorise que le propriétaire.
 *
 * `.select('id').single()` : un simple membre voit sa ligne filtrée par la policy, et doit obtenir une erreur plutôt qu'une réussite silencieuse.
 */
export async function updatePeriodStartDay(groupId: string, day: number): Promise<void> {
  const { error } = await supabase
    .from('budget_groups')
    .update({ period_start_day: day })
    .eq('id', groupId)
    .select('id')
    .single();

  if (error) {
    throw error;
  }
}

export type GroupInvitation = {
  id: string;
  code: string;
  expiresAt: string;
};

/** Invitation active d'un groupe : ni révoquée, ni utilisée, ni expirée. Au plus une à la fois. */
export async function getActiveInvitation(groupId: string): Promise<GroupInvitation | null> {
  const { data, error } = await supabase
    .from('group_invitations')
    .select('id, code, expires_at')
    .eq('group_id', groupId)
    .is('revoked_at', null)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? { id: data.id, code: data.code, expiresAt: data.expires_at } : null;
}

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Crée une invitation valide 7 jours. `code` n'est pas fourni : la base le génère (défaut `encode(gen_random_bytes(4), 'hex')`), le client ne doit jamais en inventer un.
 */
export async function createInvitation(
  groupId: string,
  createdBy: string
): Promise<GroupInvitation> {
  const { data, error } = await supabase
    .from('group_invitations')
    .insert({
      group_id: groupId,
      created_by: createdBy,
      expires_at: new Date(Date.now() + INVITATION_LIFETIME_MS).toISOString(),
    })
    .select('id, code, expires_at')
    .single();

  if (error) {
    throw error;
  }

  return { id: data.id, code: data.code, expiresAt: data.expires_at };
}

export async function revokeInvitation(id: string): Promise<void> {
  const { error } = await supabase
    .from('group_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .single();

  if (error) {
    throw error;
  }
}
