-- Wazu Finance — droits dans les groupes partagés : lecteur, rôle choisi à l'invitation, passation de propriété
--
-- Jusqu'ici tout membre pouvait modifier ou supprimer toute opération du groupe, et supprimer un prêt avec ses mouvements. Une tontine, où le trésorier tient la caisse et où les autres la suivent, n'avait aucun moyen de l'empêcher. Désormais trois rôles : propriétaire, membre, lecteur. Le lecteur voit tout et ne modifie rien.
--
-- Un propriétaire qui voulait partir devait exclure tous les autres membres : il peut maintenant passer la main.

-- ---------------------------------------------------------------------------
-- 1. Le lecteur n'écrit rien
-- ---------------------------------------------------------------------------

-- Vrai quand l'appelant est lecteur du groupe. SECURITY DEFINER pour la même raison que is_group_member() : appelée depuis un trigger sur des tables dont les policies lisent account_memberships.
create function public.is_group_viewer(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.account_memberships
     where group_id = p_group_id
       and user_id = auth.uid()
       and role = 'viewer'
  );
$$;

revoke all on function public.is_group_viewer(uuid) from public, anon;
grant execute on function public.is_group_viewer(uuid) to authenticated;

-- Un trigger plutôt qu'une réécriture des policies : il couvre d'un seul endroit les écritures directes (soumises à RLS) et celles des fonctions SECURITY DEFINER (create_debt(), record_debt_payment(), transfer_between_wallets()…), qui contournent RLS. Et il donne un message que l'app affiche tel quel, là où une policy refuserait en silence ou par un 42501 anonyme.
--
-- pg_trigger_depth() = 1 : seule une action de l'appelant est refusée. Les cascades passent — la suppression d'un groupe par son propriétaire, ou celle du compte d'un lecteur, dont les anciennes saisies perdent leur auteur (20260926000200_departed_member_history.sql).
create function public.guard_viewer_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_group uuid;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_group := case when tg_op = 'DELETE' then old.group_id else new.group_id end;
  -- Une catégorie par défaut n'appartient à aucun groupe.
  if v_group is not null and public.is_group_viewer(v_group) then
    raise exception 'Vous êtes lecteur de ce budget : vous pouvez tout consulter, mais pas modifier.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger transactions_guard_viewer before insert or update or delete on public.transactions
  for each row execute function public.guard_viewer_write();
create trigger budgets_guard_viewer before insert or update or delete on public.budgets
  for each row execute function public.guard_viewer_write();
create trigger debts_guard_viewer before insert or update or delete on public.debts
  for each row execute function public.guard_viewer_write();
create trigger wallets_guard_viewer before insert or update or delete on public.wallets
  for each row execute function public.guard_viewer_write();
create trigger wallet_transfers_guard_viewer before insert or update or delete on public.wallet_transfers
  for each row execute function public.guard_viewer_write();
create trigger recurring_transactions_guard_viewer before insert or update or delete on public.recurring_transactions
  for each row execute function public.guard_viewer_write();
create trigger categories_guard_viewer before insert or update or delete on public.categories
  for each row execute function public.guard_viewer_write();

-- ---------------------------------------------------------------------------
-- 2. Changer le rôle d'un membre
-- ---------------------------------------------------------------------------

-- Les clients n'ont aucun update sur account_memberships (20260925000100_harden_group_access.sql) : le changement de rôle passe par cette fonction, qui ne touche que `role`, et seulement entre membre et lecteur. Devenir propriétaire passe par transfer_ownership().
create function public.set_member_role(p_group_id uuid, p_user_id uuid, p_role public.membership_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  if not public.is_group_owner(p_group_id) then
    raise exception 'Seul le propriétaire du groupe peut changer les rôles.';
  end if;
  if p_role not in ('member', 'viewer') then
    raise exception 'Pour confier le groupe à un membre, utilisez « Passer la main ».';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Le propriétaire ne change pas son propre rôle.';
  end if;

  update public.account_memberships
     set role = p_role
   where group_id = p_group_id
     and user_id = p_user_id;

  if not found then
    raise exception 'Cette personne n''est plus membre du groupe.';
  end if;
end;
$$;

revoke all on function public.set_member_role(uuid, uuid, public.membership_role) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, public.membership_role) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Passer la main
-- ---------------------------------------------------------------------------

-- Un groupe garde toujours un propriétaire : l'ancien ne devient simple membre qu'une fois le nouveau en place. guard_owner_orphan() bloquait toute rétrogradation d'un propriétaire entouré d'autres membres ; il ne bloque plus que celle qui laisserait le groupe sans aucun propriétaire. Corps inchangé par ailleurs (20260911000200_fix_guard_owner_orphan_evaluation_order.sql).
create or replace function public.guard_owner_orphan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  becomes_non_owner boolean;
begin
  if tg_op = 'DELETE' then
    becomes_non_owner := true;
  else
    becomes_non_owner := new.role <> 'owner';
  end if;

  if pg_trigger_depth() = 1 and old.role = 'owner' and becomes_non_owner then
    if exists (
      select 1 from public.account_memberships
       where group_id = old.group_id and user_id <> old.user_id
    ) and not exists (
      select 1 from public.account_memberships
       where group_id = old.group_id and user_id <> old.user_id and role = 'owner'
    ) then
      raise exception 'Le propriétaire ne peut pas quitter un groupe qui a d''autres membres';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- budget_groups.owner_id suit : c'est lui que la suppression d'un compte fait partir en cascade avec le groupe. Laissé sur l'ancien propriétaire, sa suppression de compte emporterait le groupe du nouveau.
create function public.transfer_ownership(p_group_id uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;
  if not public.is_group_owner(p_group_id) then
    raise exception 'Seul le propriétaire du groupe peut passer la main.';
  end if;
  if p_new_owner = v_uid then
    raise exception 'Vous êtes déjà propriétaire de ce groupe.';
  end if;

  -- Le verrou sur les deux adhésions sérialise un départ ou une exclusion simultanés.
  perform 1 from public.account_memberships
    where group_id = p_group_id and user_id in (v_uid, p_new_owner)
    for update;

  update public.account_memberships
     set role = 'owner'
   where group_id = p_group_id
     and user_id = p_new_owner;

  if not found then
    raise exception 'Cette personne n''est plus membre du groupe.';
  end if;

  update public.account_memberships
     set role = 'member'
   where group_id = p_group_id
     and user_id = v_uid;

  update public.budget_groups
     set owner_id = p_new_owner
   where id = p_group_id
     and not is_personal;
end;
$$;

revoke all on function public.transfer_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Invitations : un rôle, et plusieurs personnes par code
-- ---------------------------------------------------------------------------

-- Le rôle est choisi à l'invitation : un code « lecteur » fait entrer en lecteur. Une tontine invite ses membres ainsi, d'un seul code.
alter table public.group_invitations
  add column role public.membership_role not null default 'member'
    constraint group_invitations_role_check check (role in ('member', 'viewer'));

grant insert (role) on public.group_invitations to authenticated;

-- Un code sert désormais à toutes les personnes qui le reçoivent, jusqu'à son échéance ou sa révocation : une tontine de quinze personnes ne génère plus quinze codes. used_at et used_by gardent la dernière utilisation. Le reste est inchangé (20260925000100_harden_group_access.sql) : même réponse NULL pour un code inconnu, révoqué ou expiré, même limite d'essais.
create or replace function public.join_group_with_code(invitation_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_code     text := upper(regexp_replace(coalesce(invitation_code, ''), '[^0-9A-Za-z]', '', 'g'));
  invitation public.group_invitations;
  personal   boolean;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('join_group_with_code:' || v_uid::text, 0));

  if (select count(*) from public.invitation_attempts
       where user_id = v_uid
         and attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de codes erronés. Réessayez dans une heure.';
  end if;

  select * into invitation
    from public.group_invitations
   where code = v_code
     for update;

  if not found
     or invitation.revoked_at is not null
     or invitation.expires_at <= now() then
    delete from public.invitation_attempts
     where user_id = v_uid
       and attempted_at <= now() - interval '1 hour';
    insert into public.invitation_attempts (user_id) values (v_uid);
    return null;
  end if;

  select is_personal into personal
    from public.budget_groups
   where id = invitation.group_id;

  if personal then
    raise exception 'Un compte personnel ne peut pas être rejoint';
  end if;

  perform 1
     from public.account_memberships
    where group_id = invitation.group_id
      and role = 'owner'
      for share;

  if not found then
    raise exception 'Ce groupe n''a plus de propriétaire : il ne peut plus être rejoint';
  end if;

  -- Déjà membre : le rôle ne change pas. Un code lecteur ne rétrograde pas un membre qui le touche par erreur.
  insert into public.account_memberships (group_id, user_id, role)
  values (invitation.group_id, v_uid, invitation.role)
  on conflict (group_id, user_id) do nothing;

  update public.group_invitations
     set used_at = now(),
         used_by = v_uid
   where id = invitation.id;

  return invitation.group_id;
end;
$$;

comment on function public.join_group_with_code(text) is
  'Rejoint le groupe de l''invitation, avec le rôle qu''elle porte. NULL si le code est inconnu, révoqué ou expiré ; au-delà de dix échecs en une heure, refus.';
