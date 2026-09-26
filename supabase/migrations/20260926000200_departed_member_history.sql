-- Wazu Finance — un compte supprimé laisse son historique dans les groupes partagés
--
-- Jusqu'ici, supprimer son compte effaçait tout ce qu'on avait saisi, y compris dans les budgets partagés qui survivent au départ : une trésorière de tontine qui saisit toutes les cotisations emportait la caisse avec elle, et les soldes des autres membres changeaient sans que personne n'ait rien fait. La suppression échouait même tout à fait pour un membre ayant saisi un prêt : delete_own_account() supprimait ses opérations directement, et guard_debt_movement(), qui voyait une action du client (pg_trigger_depth() = 1), refusait.
--
-- Désormais les opérations, dettes, transferts et récurrences d'un compte supprimé restent dans les groupes qui lui survivent. Leur user_id passe à NULL, et author_name garde le nom affiché qu'avait le membre, pour la ligne de l'historique et la colonne « Saisie par » de l'export. Ce qui ne concernait que lui part toujours entier : son compte personnel, les groupes dont il était seul membre, ses objectifs d'épargne.

-- ---------------------------------------------------------------------------
-- 1. Colonnes : user_id devient facultatif, author_name apparaît
-- ---------------------------------------------------------------------------

-- author_name n'est rempli qu'au départ de l'auteur : tant qu'il est membre, son nom se lit dans users, et un changement de nom s'y voit partout. Aucun privilège client dessus — seul set_departed_author() l'écrit.
alter table public.transactions
  alter column user_id drop not null,
  add column author_name text,
  drop constraint transactions_user_id_fkey,
  add constraint transactions_user_id_fkey foreign key (user_id) references public.users (id) on delete set null;

alter table public.debts
  alter column user_id drop not null,
  add column author_name text,
  drop constraint debts_user_id_fkey,
  add constraint debts_user_id_fkey foreign key (user_id) references public.users (id) on delete set null;

alter table public.wallet_transfers
  alter column user_id drop not null,
  add column author_name text,
  drop constraint wallet_transfers_user_id_fkey,
  add constraint wallet_transfers_user_id_fkey foreign key (user_id) references public.users (id) on delete set null;

alter table public.recurring_transactions
  alter column user_id drop not null,
  add column author_name text,
  drop constraint recurring_transactions_user_id_fkey,
  add constraint recurring_transactions_user_id_fkey foreign key (user_id) references public.users (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Reconnaître le départ d'un auteur
-- ---------------------------------------------------------------------------

-- Vrai quand une mise à jour ne fait que retirer l'auteur d'une ligne parce que son compte n'existe plus : c'est l'action `on delete set null` des clés ci-dessus. Les gardes et le journal s'en servent pour laisser passer ce changement sans le compter comme une modification.
--
-- SECURITY DEFINER : elle doit voir si l'utilisateur existe encore, qu'il partage ou non un groupe avec l'appelant. Sous RLS, un membre parti du groupe (mais dont le compte existe) serait invisible, et un client aurait pu effacer l'auteur de ses lignes en le faisant passer pour supprimé.
create function public.is_author_departure(p_old jsonb, p_new jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (p_new ->> 'user_id') is null
     and (p_old ->> 'user_id') is not null
     and (p_new - 'user_id' - 'author_name' - 'updated_at') = (p_old - 'user_id' - 'author_name' - 'updated_at')
     and not exists (select 1 from public.users where id = (p_old ->> 'user_id')::uuid);
$$;

-- Exécutable par authenticated : touch_updated_at() et guard_immutable_columns() tournent avec les droits du client qui modifie une ligne. Elle ne rend qu'un booléen sur l'existence d'un compte dont l'appelant fournit l'id, ce que la clé étrangère d'un insert révèle déjà.
revoke all on function public.is_author_departure(jsonb, jsonb) from public, anon;
grant execute on function public.is_author_departure(jsonb, jsonb) to authenticated;

-- Fige le nom de l'auteur qui part. Le nom est posé par delete_own_account() dans un réglage local à sa transaction, parce qu'au moment où la cascade atteint ces lignes, sa ligne users est déjà effacée. Une suppression faite depuis le tableau de bord Supabase ne le pose pas : la ligne reste alors sans nom, et l'app affiche « Ancien membre ».
create function public.set_departed_author()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_author_departure(to_jsonb(old), to_jsonb(new)) then
    new.author_name := nullif(current_setting('wazu.departing_name', true), '');
  elsif new.author_name is distinct from old.author_name then
    raise exception 'Colonne author_name non modifiable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger transactions_set_departed_author
  before update on public.transactions
  for each row execute function public.set_departed_author();

create trigger debts_set_departed_author
  before update on public.debts
  for each row execute function public.set_departed_author();

create trigger wallet_transfers_set_departed_author
  before update on public.wallet_transfers
  for each row execute function public.set_departed_author();

create trigger recurring_transactions_set_departed_author
  before update on public.recurring_transactions
  for each row execute function public.set_departed_author();

-- ---------------------------------------------------------------------------
-- 3. Les gardes et le journal laissent passer le départ
-- ---------------------------------------------------------------------------

-- user_id reste figé pour le client ; seul son passage à NULL par le départ de l'auteur est accepté. Corps inchangé par ailleurs (20260910000100_activity_log.sql).
create or replace function public.guard_immutable_columns()
returns trigger
language plpgsql
as $$
declare
  col text;
begin
  foreach col in array tg_argv loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      if col = 'user_id' and public.is_author_departure(to_jsonb(old), to_jsonb(new)) then
        continue;
      end if;
      raise exception 'Colonne % non modifiable', col
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

-- Le départ d'un auteur n'est pas une modification : la ligne ne doit pas se mettre à afficher « modifié ». Corps inchangé par ailleurs.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at')
     or public.is_author_departure(to_jsonb(old), to_jsonb(new)) then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- Ni une entrée de journal : des centaines de lignes « modifiées » par personne rempliraient le fil d'un groupe à chaque départ. Corps inchangé par ailleurs.
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb;
  v_changed text[];
  v_actor_id uuid;
  v_actor_name text;
begin
  if not exists (select 1 from public.budget_groups where id = old.group_id) then
    return null;
  end if;

  if tg_op = 'UPDATE' then
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
    old.group_id, tg_argv[0]::public.activity_subject, old.id, lower(tg_op)::public.activity_action,
    v_actor_id, v_actor_name, v_old, v_new, v_changed
  );

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. delete_own_account() — plus de suppression des opérations
-- ---------------------------------------------------------------------------

-- Le refus d'un propriétaire de groupe peuplé ne change pas. Ce qui disparaît : la suppression explicite des opérations du membre dans les groupes qui lui survivent. Elles restent, et la cascade `on delete set null` retire leur auteur en gardant son nom. Le compte personnel et les groupes dont il était seul membre partent toujours entiers, par la cascade sur owner_id.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_blocking text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  select string_agg(format('« %s »', b.name), ', ' order by b.name)
    into v_blocking
    from public.owned_groups_with_other_members() b;

  if v_blocking is not null then
    raise exception 'Groupes partagés dont vous êtes propriétaire et qui ont encore d''autres membres : %. Excluez ces membres avant de supprimer votre compte.', v_blocking;
  end if;

  -- Lu par set_departed_author() pendant la cascade, quand la ligne users n'existe déjà plus. `true` : le réglage ne vit que le temps de cette transaction.
  select display_name into v_name from public.users where id = v_uid;
  perform set_config('wazu.departing_name', coalesce(v_name, ''), true);

  delete from auth.users where id = v_uid;
end;
$$;
