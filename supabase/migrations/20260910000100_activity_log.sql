-- Wazu Finance — journal d'activité (traçabilité niveau 3)
--
-- Dans un budget partagé, tout membre peut modifier ou supprimer n'importe
-- quelle ligne du groupe. Cette migration garde la trace de qui a changé quoi,
-- de la valeur d'avant, et de qui a supprimé une ligne qui n'existe plus.
--
-- Spec : docs/superpowers/specs/2026-09-10-journal-activite-design.md
--
-- Ordre : (1) updated_at fiable, (2) colonnes figées, (3) remise à zéro de
-- updated_at, (4) journal. La remise à zéro précède les triggers de journal.

-- ---------------------------------------------------------------------------
-- 1. updated_at ne bouge que sur un changement réel
-- ---------------------------------------------------------------------------

-- Remplace la version du schéma initial, qui écrivait now() à chaque UPDATE :
-- un enregistrement sans changement marquait la ligne comme modifiée. La
-- comparaison ignore updated_at, avec la même expression que log_activity(),
-- pour que la mention « modifié » et le journal soient toujours d'accord.
--
-- La valeur envoyée par le client est ignorée dans les deux branches : sans
-- cela, une seconde mise à jour réglant updated_at sur created_at effacerait
-- la mention après coup.
--
-- Partagée par transactions, budgets et savings_goals.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Colonnes figées
-- ---------------------------------------------------------------------------

-- L'app ne modifie jamais ces colonnes ; la policy de modification, elle, les
-- laissait libres, et un appel direct à l'API pouvait réattribuer une dépense
-- ou la déplacer de groupe. Les figer rend « créé par » digne de foi et garde
-- chaque entrée du journal dans un seul groupe.
--
-- Générique : les colonnes arrivent en arguments du trigger. 42501 est déjà
-- traduit par src/lib/data-errors.ts.
create or replace function public.guard_immutable_columns()
returns trigger
language plpgsql
as $$
declare
  col text;
begin
  foreach col in array tg_argv loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      raise exception 'Colonne % non modifiable', col
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create trigger transactions_guard_immutable
  before update on public.transactions
  for each row execute function public.guard_immutable_columns('user_id', 'group_id');

-- category_id aussi : l'interface verrouille déjà la catégorie en édition, la
-- base s'aligne dessus.
create trigger budgets_guard_immutable
  before update on public.budgets
  for each row execute function public.guard_immutable_columns('group_id', 'category_id');

-- ---------------------------------------------------------------------------
-- 3. Remise à zéro de updated_at — écrit sur les données existantes
-- ---------------------------------------------------------------------------

-- Les dates de modification actuelles ne valent rien : un enregistrement sans
-- changement les faisait bouger. Sans remise à zéro, des lignes jamais
-- réellement modifiées afficheraient « modifié » à vie. Le journal comme la
-- mention commencent donc au jour de cette migration. Irréversible.
--
-- Les triggers updated_at sont coupés le temps de l'opération, et ce n'est pas
-- une précaution de confort : l'ancienne version réécrirait now() sur chaque
-- ligne, la nouvelle — qui ignore la valeur envoyée — rétablirait
-- old.updated_at. Dans les deux cas la remise à zéro n'aurait aucun effet.
alter table public.transactions disable trigger transactions_touch_updated_at;
alter table public.budgets disable trigger budgets_touch_updated_at;

update public.transactions set updated_at = created_at where updated_at <> created_at;
update public.budgets set updated_at = created_at where updated_at <> created_at;

alter table public.transactions enable trigger transactions_touch_updated_at;
alter table public.budgets enable trigger budgets_touch_updated_at;

-- ---------------------------------------------------------------------------
-- 4. Journal
-- ---------------------------------------------------------------------------

create type public.activity_subject as enum ('transaction', 'budget');
create type public.activity_action as enum ('update', 'delete');

-- subject_id n'a pas de clé étrangère : la ligne visée peut avoir été
-- supprimée, et c'est précisément le cas qu'on veut garder.
--
-- actor_id passe à null si l'auteur supprime son compte ; actor_name garde son
-- nom tel qu'il était au moment de l'action. Les deux sont null pour une
-- action faite hors session (console SQL, clé de service) : le journal ne
-- prétend pas connaître un auteur qu'il n'a pas.
--
-- new_values est null pour une suppression, et changed_fields y est vide.
--
-- La table n'est pas dans la publication Realtime : le fil se consulte
-- délibérément et se recharge à l'ouverture.
create table public.activity_log (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.budget_groups (id) on delete cascade,
  subject        public.activity_subject not null,
  subject_id     uuid not null,
  action         public.activity_action not null,
  actor_id       uuid references public.users (id) on delete set null,
  actor_name     text,
  old_values     jsonb not null,
  new_values     jsonb,
  changed_fields text[] not null,
  occurred_at    timestamptz not null default now()
);

-- Couvre le filtre groupe + le tri du fil, et le départage par id rend la
-- pagination par curseur stable quand deux entrées partagent un instant.
create index activity_log_group_occurred_idx
  on public.activity_log (group_id, occurred_at desc, id desc);

alter table public.activity_log enable row level security;

-- Lecture : tout membre du groupe, et lui seul. Un membre qui quitte le groupe
-- perd l'accès.
create policy "activity_log_select_member"
  on public.activity_log for select to authenticated
  using (public.is_group_member(group_id));

-- Écriture : aucune policy, et les droits sont retirés en plus de RLS. Les
-- privilèges par défaut de Supabase donnent tout à anon et authenticated sur
-- une table neuve ; on repart de rien et on ne rend que la lecture. Seuls les
-- triggers écrivent.
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;

-- security definer, et ce n'est pas par imitation des fonctions
-- d'appartenance : le trigger doit insérer dans une table où les clients n'ont
-- délibérément aucun droit d'écriture. Leur donner ce droit pour que le
-- trigger tourne en security invoker leur permettrait d'écrire eux-mêmes de
-- fausses entrées. Une fonction de trigger n'est pas appelable comme RPC.
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
  -- 1. Groupe disparu : on est dans la cascade d'une suppression de groupe ou
  -- de compte. La ligne parente n'est déjà plus visible ; insérer une entrée
  -- qui la désigne ferait échouer la clé étrangère et annulerait toute la
  -- suppression. Un journal n'a de sens que pour un groupe qui existe encore.
  if not exists (select 1 from public.budget_groups where id = old.group_id) then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    v_new := to_jsonb(new);

    -- 2. Même comparaison que touch_updated_at() : updated_at ignoré. Aucune
    -- autre différence, aucune entrée.
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

  -- 3. L'auteur est lu dans users, jamais pris à auth.uid() directement. Pendant
  -- la cascade d'une suppression de compte faite par son titulaire, sa ligne
  -- users est déjà effacée : un actor_id pris tel quel ferait échouer la clé
  -- étrangère, et la suppression du compte serait annulée. Ligne absente, les
  -- deux restent null.
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

revoke all on function public.log_activity() from public, anon, authenticated;

-- Modifications et suppressions seulement : une création est entièrement
-- décrite par la ligne elle-même (auteur, date). Brancher une nouvelle table
-- tient en un trigger de plus et une valeur de plus dans activity_subject.
create trigger transactions_log_activity
  after update or delete on public.transactions
  for each row execute function public.log_activity('transaction');

create trigger budgets_log_activity
  after update or delete on public.budgets
  for each row execute function public.log_activity('budget');
