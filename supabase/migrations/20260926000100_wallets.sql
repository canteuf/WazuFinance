-- Wazu Finance — portefeuilles : espèces, mobile money, banque
--
-- En zone CFA, l'argent d'un ménage se répartit entre la poche, MTN MoMo, Orange Money et parfois une banque. Sans portefeuilles, l'app ne répondait pas à la question « combien me reste-t-il vraiment, et où ? », et un retrait MoMo vers les espèces se saisissait comme une dépense.
--
-- Chaque opération appartient désormais à un portefeuille de son groupe. Le solde d'un portefeuille est son solde de départ, plus ses entrées, moins ses sorties, plus ou moins les transferts. Un transfert ne change pas le solde du groupe ; ses frais, eux, sont une vraie dépense.
--
-- L'app déjà installée ne connaît pas les portefeuilles : une opération qui arrive sans portefeuille est rangée dans celui par défaut du groupe (partie 3). La colonne reste donc nullable côté client, mais aucune ligne n'en manque.

-- ---------------------------------------------------------------------------
-- 1. wallets
-- ---------------------------------------------------------------------------

-- kind ne sert qu'à l'icône et au libellé ; il ne change aucun calcul.
create type public.wallet_kind as enum ('cash', 'mobile_money', 'bank', 'other');

-- opening_balance : ce que le portefeuille contenait quand on a commencé à le suivre (l'argent en poche, le solde affiché par l'app MoMo). Ce n'est pas un revenu : il fixe le point de départ sans entrer dans les totaux d'une période. Il peut être négatif, pour un découvert bancaire. « Ajuster au solde réel » le corrige (adjust_wallet_balance()).
--
-- is_default : un seul par groupe, celui qui reçoit l'historique et les opérations saisies sans portefeuille. Il ne se supprime pas.
create table public.wallets (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.budget_groups (id) on delete cascade,
  name            text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  kind            public.wallet_kind not null default 'cash',
  opening_balance numeric(12, 2) not null default 0 check (opening_balance = round(opening_balance)),
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index wallets_unique_group_name on public.wallets (group_id, lower(name));
create unique index wallets_one_default_per_group on public.wallets (group_id) where is_default;

create trigger wallets_touch_updated_at
  before update on public.wallets
  for each row execute function public.touch_updated_at();

alter table public.wallets enable row level security;

create policy "wallets_select_member"
  on public.wallets for select to authenticated
  using (public.is_group_member(group_id));

create policy "wallets_insert_member"
  on public.wallets for insert to authenticated
  with check (public.is_group_member(group_id) and not is_default);

create policy "wallets_update_member"
  on public.wallets for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

create policy "wallets_delete_member"
  on public.wallets for delete to authenticated
  using (public.is_group_member(group_id));

-- Le client crée un portefeuille avec son nom, son type et son solde de départ ; il en modifie les mêmes colonnes. is_default et group_id ne sont jamais écrits par lui : le portefeuille par défaut est créé par la base (partie 2).
revoke all on public.wallets from anon, authenticated;
grant select, delete on public.wallets to authenticated;
grant insert (id, group_id, name, kind, opening_balance) on public.wallets to authenticated;
grant update (name, kind, opening_balance) on public.wallets to authenticated;

-- Un portefeuille ne se supprime que vide : ses opérations et ses transferts disparaîtraient du solde sans qu'on sache où les ranger. Le portefeuille par défaut ne se supprime jamais. Message en P0001, que l'app affiche tel quel ; la clé étrangère seule aurait levé un 23503 que l'app traduit par « Cette catégorie n'existe plus ».
--
-- pg_trigger_depth() = 1 : la suppression en cascade d'un groupe emporte ses portefeuilles, défaut compris.
create function public.guard_wallet_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  if old.is_default then
    raise exception 'Le portefeuille par défaut ne se supprime pas. Renommez-le si besoin.';
  end if;
  if exists (select 1 from public.transactions where wallet_id = old.id)
     or exists (select 1 from public.wallet_transfers where from_wallet_id = old.id or to_wallet_id = old.id) then
    raise exception 'Ce portefeuille contient des opérations ou des transferts : il ne peut pas être supprimé.';
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Un portefeuille « Principal » par groupe
-- ---------------------------------------------------------------------------

-- À chaque groupe créé, compte personnel compris : handle_new_user() et create_shared_group() insèrent dans budget_groups, et ce trigger les suit sans qu'il faille toucher à l'une ou l'autre. SECURITY DEFINER : il écrit is_default, que le client n'a pas le droit d'écrire, et s'exécute aussi dans la transaction d'inscription de Supabase Auth.
create function public.create_default_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (group_id, name, kind, is_default)
  values (new.id, 'Principal', 'cash', true);
  return new;
end;
$$;

create trigger budget_groups_create_default_wallet
  after insert on public.budget_groups
  for each row execute function public.create_default_wallet();

-- Les groupes existants reçoivent le leur.
insert into public.wallets (group_id, name, kind, is_default)
select g.id, 'Principal', 'cash', true
  from public.budget_groups g;

-- ---------------------------------------------------------------------------
-- 3. transactions.wallet_id
-- ---------------------------------------------------------------------------

-- Clé étrangère sans action (no action), et non `restrict` : la vérification attend la fin de l'instruction. La suppression d'un groupe emporte à la fois ses portefeuilles et ses opérations, dans un ordre que Postgres choisit ; `restrict` échouait si le portefeuille partait avant les opérations qui le citent. La suppression directe d'un portefeuille utilisé est arrêtée plus tôt, avec un message clair, par guard_wallet_delete().
alter table public.transactions
  add column wallet_id uuid references public.wallets (id);

create index transactions_wallet_id_idx on public.transactions (wallet_id);

-- L'historique va dans le portefeuille par défaut de son groupe. Les triggers utilisateur de la table sont suspendus le temps de cette mise à jour : sans cela, touch_updated_at() marquerait chaque opération « modifiée », log_activity() remplirait le journal de milliers d'entrées, et les gardes de l'épargne et des dettes refuseraient de toucher à leurs mouvements. Les contraintes (clés étrangères comprises) restent actives.
alter table public.transactions disable trigger user;

update public.transactions t
   set wallet_id = w.id
  from public.wallets w
 where w.group_id = t.group_id
   and w.is_default;

alter table public.transactions enable trigger user;

-- Une opération sans portefeuille va dans celui par défaut de son groupe : c'est le cas de toute saisie de l'app déjà installée, et des mouvements écrits par add_to_savings_goal(), create_debt() ou confirm_recurring(). Un portefeuille d'un autre groupe est refusé : il ferait compter l'opération dans un solde qui n'est pas le sien.
create function public.assign_transaction_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_group uuid;
begin
  if new.wallet_id is null then
    select id into new.wallet_id
      from public.wallets
     where group_id = new.group_id
       and is_default;
    return new;
  end if;

  select group_id into wallet_group from public.wallets where id = new.wallet_id;
  if wallet_group is distinct from new.group_id then
    raise exception 'Ce portefeuille n''appartient pas à ce budget.';
  end if;
  return new;
end;
$$;

create trigger transactions_assign_wallet
  before insert or update of wallet_id on public.transactions
  for each row execute function public.assign_transaction_wallet();

-- Le client choisit le portefeuille à la saisie et peut en changer en modifiant l'opération.
grant insert (wallet_id) on public.transactions to authenticated;
grant update (wallet_id) on public.transactions to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Transferts entre portefeuilles
-- ---------------------------------------------------------------------------

-- Un transfert déplace de l'argent d'un portefeuille à l'autre du même groupe, sans changer le solde du groupe : ce n'est ni une dépense ni un revenu, d'où une table à part plutôt que deux opérations. Ses frais, eux, sont une vraie dépense : une opération « Frais mobile money » prélevée sur le portefeuille d'origine, référencée par fee_transaction_id.
--
-- Pas de suppression : un transfert erroné se corrige par un transfert inverse, qui garde la trace des deux.
create table public.wallet_transfers (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.budget_groups (id) on delete cascade,
  user_id            uuid not null references public.users (id) on delete cascade,
  from_wallet_id     uuid not null references public.wallets (id),
  to_wallet_id       uuid not null references public.wallets (id),
  amount             numeric(12, 2) not null check (amount > 0 and amount = round(amount)),
  fee_transaction_id uuid references public.transactions (id) on delete set null,
  occurred_on        date not null,
  note               text check (note is null or char_length(note) <= 120),
  created_at         timestamptz not null default now(),
  constraint wallet_transfers_distinct check (from_wallet_id <> to_wallet_id)
);

create index wallet_transfers_group_idx on public.wallet_transfers (group_id, occurred_on desc);

alter table public.wallet_transfers enable row level security;

create policy "wallet_transfers_select_member"
  on public.wallet_transfers for select to authenticated
  using (public.is_group_member(group_id));

revoke all on public.wallet_transfers from anon, authenticated;
grant select on public.wallet_transfers to authenticated;

-- Dans la publication Realtime : un transfert ou un portefeuille créé par un membre met à jour les soldes chez les autres. Les opérations y sont déjà.
alter publication supabase_realtime add table public.wallets;
alter publication supabase_realtime add table public.wallet_transfers;

-- Maintenant que wallet_transfers existe, la garde de suppression peut la lire.
create trigger wallets_guard_delete
  before delete on public.wallets
  for each row execute function public.guard_wallet_delete();

-- SECURITY INVOKER : la fonction n'écrit que ce que le client pourrait écrire lui-même, sauf la ligne de transfert, pour laquelle aucune policy d'insertion n'existe. Elle est donc SECURITY DEFINER, et vérifie elle-même l'appartenance au groupe et que les deux portefeuilles en font partie.
--
-- p_id et p_fee_transaction_id viennent de l'app : un renvoi retrouve le transfert au lieu d'en créer un second.
create function public.transfer_between_wallets(
  p_id uuid,
  p_from_wallet_id uuid,
  p_to_wallet_id uuid,
  p_amount numeric,
  p_occurred_on date,
  p_fee_transaction_id uuid,
  p_fee numeric default 0,
  p_note text default null
)
returns public.wallet_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  created public.wallet_transfers;
  source public.wallets;
  target public.wallets;
  fee_category uuid;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  select * into created from public.wallet_transfers where id = p_id;
  if found then
    return created;
  end if;

  select * into source from public.wallets where id = p_from_wallet_id;
  select * into target from public.wallets where id = p_to_wallet_id;
  if source.id is null or target.id is null
     or source.group_id <> target.group_id
     or not public.is_group_member(source.group_id) then
    raise exception 'Ce portefeuille n''existe plus.';
  end if;

  if source.id = target.id then
    raise exception 'Choisissez deux portefeuilles différents.';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount) then
    raise exception 'Indiquez un montant entier, supérieur à zéro.';
  end if;
  if p_fee is null or p_fee < 0 or p_fee <> round(p_fee) then
    raise exception 'Les frais sont un montant entier, zéro ou plus.';
  end if;

  if p_fee > 0 then
    select id into fee_category
      from public.categories
     where group_id is null and type = 'expense' and name = 'Frais mobile money';

    insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on, note, wallet_id)
    values (
      p_fee_transaction_id,
      source.group_id,
      v_uid,
      fee_category,
      'expense',
      p_fee,
      coalesce(p_occurred_on, current_date),
      'Frais de transfert vers ' || target.name,
      source.id
    );
  end if;

  insert into public.wallet_transfers (id, group_id, user_id, from_wallet_id, to_wallet_id, amount, fee_transaction_id, occurred_on, note)
  values (
    p_id,
    source.group_id,
    v_uid,
    source.id,
    target.id,
    p_amount,
    case when p_fee > 0 then p_fee_transaction_id end,
    coalesce(p_occurred_on, current_date),
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning * into created;

  return created;
end;
$$;

revoke all on function public.transfer_between_wallets(uuid, uuid, uuid, numeric, date, uuid, numeric, text) from public, anon;
grant execute on function public.transfer_between_wallets(uuid, uuid, uuid, numeric, date, uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Soldes
-- ---------------------------------------------------------------------------

-- Solde de chaque portefeuille du groupe, depuis toujours : départ + entrées − sorties + transferts reçus − transferts envoyés. SECURITY INVOKER : les policies s'appliquent, un non-membre n'obtient aucune ligne. Le portefeuille par défaut en tête, puis par date de création.
create function public.wallets_overview(p_group_id uuid)
returns table (
  id uuid,
  name text,
  kind public.wallet_kind,
  is_default boolean,
  opening_balance numeric,
  balance numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    w.id,
    w.name,
    w.kind,
    w.is_default,
    w.opening_balance,
    w.opening_balance
      + coalesce((select sum(case when t.type = 'income' then t.amount else -t.amount end)
                    from public.transactions t where t.wallet_id = w.id), 0)
      + coalesce((select sum(x.amount) from public.wallet_transfers x where x.to_wallet_id = w.id), 0)
      - coalesce((select sum(x.amount) from public.wallet_transfers x where x.from_wallet_id = w.id), 0)
  from public.wallets w
  where w.group_id = p_group_id
  order by w.is_default desc, w.created_at, w.id;
$$;

revoke all on function public.wallets_overview(uuid) from public, anon;
grant execute on function public.wallets_overview(uuid) to authenticated;

-- « Ajuster au solde réel » : l'utilisateur compte ce qu'il a en poche ou lit son solde MoMo, et l'app aligne le portefeuille dessus. L'écart s'ajoute au solde de départ plutôt que de créer une opération : un oubli de saisie n'est ni une dépense ni un revenu de la période, et une opération fictive fausserait les totaux. Le `for update` sérialise deux ajustements simultanés.
create function public.adjust_wallet_balance(p_wallet_id uuid, p_actual numeric)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  wallet public.wallets;
  current_balance numeric;
begin
  if p_actual is null or p_actual <> round(p_actual) then
    raise exception 'Indiquez un montant entier.';
  end if;

  select * into wallet from public.wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'Ce portefeuille n''existe plus.';
  end if;

  select o.balance into current_balance
    from public.wallets_overview(wallet.group_id) o
   where o.id = wallet.id;

  update public.wallets
     set opening_balance = opening_balance + (p_actual - current_balance)
   where id = wallet.id;

  return p_actual - current_balance;
end;
$$;

revoke all on function public.adjust_wallet_balance(uuid, numeric) from public, anon;
grant execute on function public.adjust_wallet_balance(uuid, numeric) to authenticated;
