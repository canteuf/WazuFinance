-- Les suppressions passent par des canaux Realtime privés, par groupe et par utilisateur, au lieu d'abonnements DELETE sans filtre.
--
-- Supabase n'applique ni RLS ni filtre aux événements DELETE de postgres_changes. Pour voir les suppressions des autres membres, l'app s'abonnait donc aux DELETE de toute la table : chaque client connecté recevait l'identifiant et l'heure de chaque suppression de toute la base (prouvé sur la pile locale : Bob recevait l'id d'une opération supprimée par Alice dans son compte personnel), objectifs d'épargne compris, et rechargeait ses données à chaque fois. Supprimer un compte de 3 000 opérations envoyait 3 000 événements à chaque téléphone connecté, de quoi épuiser le quota Realtime du plan gratuit.
--
-- Désormais un trigger par instruction annonce la suppression sur le sujet « group:<id> » (ou « user:<id> » pour un objectif d'épargne et pour la personne qui perd une adhésion), une fois par groupe touché, et seuls les membres de ce groupe peuvent écouter ce sujet. Une cascade qui efface 3 000 opérations d'un groupe n'envoie qu'un message. Le message ne porte que le nom de la table : l'app recharge, elle ne lit rien de plus.

-- Annonce une suppression. SECURITY DEFINER : une suppression faite depuis le tableau de bord passe sous supabase_auth_admin, qui n'a aucun droit sur realtime.messages. Une annonce qui échoue ne doit jamais faire échouer la suppression elle-même : l'erreur est avalée, l'app rattrape au prochain rechargement.
create function public.announce_deletion(p_topic text, p_table text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.send(jsonb_build_object('table', p_table), 'deleted', p_topic, true);
exception when others then
  null;
end;
$$;
revoke all on function public.announce_deletion(text, text) from public, anon, authenticated;

-- Tables rattachées à un groupe.
create function public.broadcast_group_deletions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid;
begin
  for v_group in select distinct group_id from old_rows loop
    perform public.announce_deletion('group:' || v_group::text, tg_table_name);
  end loop;
  return null;
end;
$$;
revoke all on function public.broadcast_group_deletions() from public, anon, authenticated;

create trigger transactions_broadcast_deletions after delete on public.transactions
  referencing old table as old_rows for each statement execute function public.broadcast_group_deletions();
create trigger budgets_broadcast_deletions after delete on public.budgets
  referencing old table as old_rows for each statement execute function public.broadcast_group_deletions();
create trigger wallets_broadcast_deletions after delete on public.wallets
  referencing old table as old_rows for each statement execute function public.broadcast_group_deletions();
create trigger recurring_transactions_broadcast_deletions after delete on public.recurring_transactions
  referencing old table as old_rows for each statement execute function public.broadcast_group_deletions();

-- Une adhésion supprimée : les membres restants voient la liste changer, et la personne exclue voit le groupe disparaître — elle n'est plus membre, d'où son sujet personnel.
create function public.broadcast_membership_deletions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  for v_row in select distinct group_id, user_id from old_rows loop
    perform public.announce_deletion('group:' || v_row.group_id::text, tg_table_name);
    perform public.announce_deletion('user:' || v_row.user_id::text, tg_table_name);
  end loop;
  return null;
end;
$$;
revoke all on function public.broadcast_membership_deletions() from public, anon, authenticated;

create trigger account_memberships_broadcast_deletions after delete on public.account_memberships
  referencing old table as old_rows for each statement execute function public.broadcast_membership_deletions();

-- Un objectif d'épargne est personnel : son sujet est celui de son propriétaire, qui le synchronise entre ses appareils.
create function public.broadcast_user_deletions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  for v_user in select distinct user_id from old_rows loop
    perform public.announce_deletion('user:' || v_user::text, tg_table_name);
  end loop;
  return null;
end;
$$;
revoke all on function public.broadcast_user_deletions() from public, anon, authenticated;

create trigger savings_goals_broadcast_deletions after delete on public.savings_goals
  referencing old table as old_rows for each statement execute function public.broadcast_user_deletions();

-- Qui peut écouter quoi : un sujet « group:<id> » pour les membres du groupe, lecteurs compris, et son propre sujet « user:<id> ». Aucune policy d'insertion : seuls les triggers ci-dessus émettent, un client ne peut pas diffuser sur ces canaux.
create policy "realtime_messages_member_topics"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      (select realtime.topic()) = 'user:' || (select auth.uid())::text
      or (select realtime.topic()) in (select 'group:' || g::text from public.my_group_ids() g)
    )
  );
