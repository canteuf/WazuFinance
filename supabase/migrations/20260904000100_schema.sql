-- Wazu Finance — schéma de base (spec section 3)
--
-- Principe central : un compte personnel privé est un budget_group à un seul
-- membre. Il n'existe donc aucune table « compte perso » séparée, et toutes les
-- règles d'accès passent par account_memberships.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.membership_role as enum ('owner', 'member');
create type public.transaction_type as enum ('expense', 'income');
create type public.budget_period as enum ('weekly', 'monthly');

-- ---------------------------------------------------------------------------
-- users — profil applicatif, adossé à auth.users
-- ---------------------------------------------------------------------------

create table public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- budget_groups — compte perso (is_personal) ou budget partagé
-- ---------------------------------------------------------------------------

create table public.budget_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references public.users (id) on delete cascade,
  is_personal boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Un seul groupe personnel par utilisateur ; les groupes partagés ne sont pas
-- contraints.
create unique index budget_groups_one_personal_per_owner
  on public.budget_groups (owner_id)
  where is_personal;

create index budget_groups_owner_id_idx on public.budget_groups (owner_id);

-- ---------------------------------------------------------------------------
-- account_memberships — liaison users <-> budget_groups, avec rôle
-- ---------------------------------------------------------------------------

create table public.account_memberships (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.budget_groups (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  role       public.membership_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index account_memberships_user_id_idx on public.account_memberships (user_id);

-- ---------------------------------------------------------------------------
-- categories — group_id NULL = catégorie par défaut, visible par tous
-- ---------------------------------------------------------------------------

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references public.budget_groups (id) on delete cascade,
  name       text not null,
  icon       text not null default 'tag',
  type       public.transaction_type not null default 'expense',
  created_at timestamptz not null default now()
);

create index categories_group_id_idx on public.categories (group_id);

-- Pas d'homonymes : une fois parmi les catégories par défaut, une fois par groupe.
create unique index categories_unique_default_name
  on public.categories (name, type)
  where group_id is null;

create unique index categories_unique_group_name
  on public.categories (group_id, name, type)
  where group_id is not null;

-- ---------------------------------------------------------------------------
-- savings_goals — objectifs d'épargne (spec 2.5), rattachés à un utilisateur
-- ---------------------------------------------------------------------------

create table public.savings_goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  name           text not null,
  target_amount  numeric(12, 2) not null check (target_amount > 0),
  current_amount numeric(12, 2) not null default 0 check (current_amount >= 0),
  target_date    date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index savings_goals_user_id_idx on public.savings_goals (user_id);

-- ---------------------------------------------------------------------------
-- transactions — dépense ou revenu
-- ---------------------------------------------------------------------------

create table public.transactions (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.budget_groups (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  category_id     uuid references public.categories (id) on delete set null,
  -- Versement rattaché à un objectif d'épargne (spec 2.5).
  savings_goal_id uuid references public.savings_goals (id) on delete set null,
  type            public.transaction_type not null,
  amount          numeric(12, 2) not null check (amount > 0),
  occurred_on     date not null default current_date,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- L'historique est trié par date décroissante et paginé (spec 4.3) : l'index
-- composite couvre le filtre groupe + le tri.
create index transactions_group_occurred_idx
  on public.transactions (group_id, occurred_on desc, id desc);

create index transactions_category_id_idx on public.transactions (category_id);
create index transactions_savings_goal_id_idx on public.transactions (savings_goal_id);

-- ---------------------------------------------------------------------------
-- budgets — plafond par catégorie, par groupe, par période (spec 2.4)
-- ---------------------------------------------------------------------------

create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.budget_groups (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  period      public.budget_period not null default 'monthly',
  amount      numeric(12, 2) not null check (amount > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (group_id, category_id, period)
);

-- ---------------------------------------------------------------------------
-- group_invitations — invitation par lien ou code (spec 2.1), expirable et
-- révocable (exigence 4.1)
-- ---------------------------------------------------------------------------

create table public.group_invitations (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.budget_groups (id) on delete cascade,
  code       text not null unique,
  created_by uuid not null references public.users (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at    timestamptz,
  used_by    uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index group_invitations_group_id_idx on public.group_invitations (group_id);

-- ---------------------------------------------------------------------------
-- updated_at automatique
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger transactions_touch_updated_at
  before update on public.transactions
  for each row execute function public.touch_updated_at();

create trigger budgets_touch_updated_at
  before update on public.budgets
  for each row execute function public.touch_updated_at();

create trigger savings_goals_touch_updated_at
  before update on public.savings_goals
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Provisionnement à l'inscription
--
-- À la création d'un compte auth, on crée dans la même transaction : le profil,
-- son groupe personnel, et l'adhésion owner correspondante. L'app n'a donc
-- jamais à gérer l'état « utilisateur sans groupe ».
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  personal_group_id uuid;
  name              text;
begin
  name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.users (id, email, display_name)
  values (new.id, new.email, name);

  insert into public.budget_groups (name, owner_id, is_personal)
  values ('Compte personnel', new.id, true)
  returning id into personal_group_id;

  insert into public.account_memberships (group_id, user_id, role)
  values (personal_group_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Realtime — sync entre appareils pour les budgets partagés (spec 4.2).
-- Les policies RLS s'appliquent aussi aux messages Realtime.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.budgets;
alter publication supabase_realtime add table public.savings_goals;
alter publication supabase_realtime add table public.account_memberships;
