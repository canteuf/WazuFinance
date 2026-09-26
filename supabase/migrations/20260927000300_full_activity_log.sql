-- Wazu Finance — journal d'activité complet, et noms des anciens membres
--
-- Le journal ne gardait que les modifications et suppressions d'opérations et de budgets. Une trésorière de tontine qui rend des comptes en réunion avait besoin du reste : qui a saisi quoi, qui a créé ou soldé un prêt, déplacé de l'argent entre portefeuilles, qui est arrivé ou parti, et qui a changé de rôle.
--
-- Et un membre parti disparaissait de partout : users_select_self_or_covisible ne montre que les membres actuels, donc ses saisies perdaient leur auteur à l'écran et dans la colonne « Saisie par » de l'export.

-- ---------------------------------------------------------------------------
-- 1. former_members — le nom d'un membre au moment de son départ
-- ---------------------------------------------------------------------------

-- Un instantané plutôt qu'un accès élargi à users : quelqu'un qui a quitté un groupe n'a pas à y exposer son nom ou son visage à venir. Une ligne par groupe et par personne ; revenir dans le groupe l'efface, puisque le membre est de nouveau visible.
create table public.former_members (
  group_id     uuid not null references public.budget_groups (id) on delete cascade,
  user_id      uuid not null,
  display_name text not null,
  avatar       text,
  left_at      timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.former_members enable row level security;

create policy "former_members_select_member"
  on public.former_members for select to authenticated
  using (public.is_group_member(group_id));

-- Écrit par trigger seulement.
revoke all on public.former_members from anon, authenticated;
grant select on public.former_members to authenticated;

-- SECURITY DEFINER : un membre qui part ne peut pas écrire dans former_members, et la ligne users d'un compte supprimé n'est plus lisible quand la cascade atteint ses adhésions — son nom vient alors du réglage que pose delete_own_account().
create function public.remember_former_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text;
  v_avatar text;
begin
  if tg_op = 'INSERT' then
    delete from public.former_members where group_id = new.group_id and user_id = new.user_id;
    return null;
  end if;

  -- Groupe disparu (cascade d'une suppression de groupe) ou compte personnel : rien à retenir.
  if not exists (select 1 from public.budget_groups where id = old.group_id and not is_personal) then
    return null;
  end if;

  select display_name, avatar into v_name, v_avatar from public.users where id = old.user_id;
  v_name := coalesce(v_name, nullif(current_setting('wazu.departing_name', true), ''));
  if v_name is null then
    return null;
  end if;

  insert into public.former_members (group_id, user_id, display_name, avatar)
  values (old.group_id, old.user_id, v_name, v_avatar)
  on conflict (group_id, user_id) do update
    set display_name = excluded.display_name, avatar = excluded.avatar, left_at = now();
  return null;
end;
$$;

revoke all on function public.remember_former_member() from public, anon, authenticated;

create trigger account_memberships_remember_former
  after insert or delete on public.account_memberships
  for each row execute function public.remember_former_member();

-- ---------------------------------------------------------------------------
-- 2. activity_log accepte les créations
-- ---------------------------------------------------------------------------

-- Une création n'a pas de valeurs d'avant : old_values devient facultatif. new_values l'était déjà (suppression).
alter table public.activity_log alter column old_values drop not null;

-- ---------------------------------------------------------------------------
-- 3. log_activity() — créations, et quatre sujets de plus
-- ---------------------------------------------------------------------------

-- Ce qui ne change pas (20260926000200_departed_member_history.sql) : rien pour un groupe disparu, rien pour le départ d'un auteur, rien pour une mise à jour sans changement, l'auteur lu dans users.
--
-- Ce qui s'ajoute :
--   - les créations (INSERT), avec old_values NULL et new_values la ligne créée ;
--   - rien pour une création dans un compte personnel : son titulaire est seul à le lire, l'historique lui suffit, et l'inscription (handle_new_user(), qui crée compte personnel, adhésion et portefeuille) n'écrit ainsi rien de plus dans la transaction de Supabase Auth, où un échec ne se lit que comme « Database error saving new user » ;
--   - rien pour l'opération de départ d'un prêt : create_debt() l'insère dans la même transaction que la dette, qui a déjà son entrée. Les remboursements, eux, en ont une ;
--   - rien pour l'adhésion du propriétaire à la création d'un groupe : « a rejoint son propre groupe » n'apprend rien.
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_group uuid;
  v_changed text[];
  v_actor_id uuid;
  v_actor_name text;
begin
  if tg_op = 'INSERT' then
    v_row := to_jsonb(new);
    v_new := v_row;
  else
    v_row := to_jsonb(old);
    v_old := v_row;
  end if;
  v_group := (v_row ->> 'group_id')::uuid;

  if not exists (select 1 from public.budget_groups where id = v_group) then
    return null;
  end if;

  -- Les adhésions d'un compte personnel ne changent qu'à l'inscription et à la suppression du compte : rien à raconter.
  if tg_argv[0] = 'membership' and exists (select 1 from public.budget_groups where id = v_group and is_personal) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    if exists (select 1 from public.budget_groups where id = v_group and is_personal) then
      return null;
    end if;
    if tg_argv[0] = 'transaction' and (v_new ->> 'debt_id') is not null and exists (
      select 1 from public.debts where id = (v_new ->> 'debt_id')::uuid and created_at = now()
    ) then
      return null;
    end if;
    if tg_argv[0] = 'membership' and (v_new ->> 'role') = 'owner' then
      return null;
    end if;
    v_changed := '{}';
  elsif tg_op = 'UPDATE' then
    v_new := to_jsonb(new);

    if public.is_author_departure(v_old, v_new) then
      return null;
    end if;

    select coalesce(array_agg(n.key order by n.key), '{}')
      into v_changed
      from jsonb_each(v_new - 'updated_at') as n (key, value)
     where n.value is distinct from (v_old -> n.key);

    if cardinality(v_changed) = 0 then
      return null;
    end if;
  else
    v_changed := '{}';
  end if;

  select u.id, u.display_name
    into v_actor_id, v_actor_name
    from public.users u
   where u.id = auth.uid();

  insert into public.activity_log (
    group_id, subject, subject_id, action,
    actor_id, actor_name, old_values, new_values, changed_fields
  ) values (
    v_group, tg_argv[0]::public.activity_subject, (v_row ->> 'id')::uuid, lower(tg_op)::public.activity_action,
    v_actor_id, v_actor_name, v_old, v_new, v_changed
  );

  return null;
end;
$$;

-- Les créations s'ajoutent aux deux triggers existants.
drop trigger transactions_log_activity on public.transactions;
create trigger transactions_log_activity
  after insert or update or delete on public.transactions
  for each row execute function public.log_activity('transaction');

drop trigger budgets_log_activity on public.budgets;
create trigger budgets_log_activity
  after insert or update or delete on public.budgets
  for each row execute function public.log_activity('budget');

create trigger debts_log_activity
  after insert or update or delete on public.debts
  for each row execute function public.log_activity('debt');

create trigger wallets_log_activity
  after insert or update or delete on public.wallets
  for each row execute function public.log_activity('wallet');

-- Un transfert ne se modifie ni ne se supprime : sa création suffit.
create trigger wallet_transfers_log_activity
  after insert on public.wallet_transfers
  for each row execute function public.log_activity('transfer');

-- Arrivées, départs et exclusions, changements de rôle et passations.
create trigger account_memberships_log_activity
  after insert or update or delete on public.account_memberships
  for each row execute function public.log_activity('membership');
