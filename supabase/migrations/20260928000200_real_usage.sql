-- Wazu Finance — usages réels : commerce, famille
--
-- Troisième série de corrections de l'audit du 26 septembre 2026 :
--   1. une catégorie par défaut « Achat de stock » ;
--   2. des étiquettes sur les opérations (« Argent de Jean », « Rentrée 2027 ») ;
--   3. un portefeuille retenu par chaque opération récurrente ;
--   4. un seul filtre de l'historique, partagé par la liste des totaux, les totaux par jour et les sous-totaux par catégorie ; multi-catégories, portefeuille et étiquette ;
--   5. la vente à crédit ;
--   6. le portefeuille au choix pour les prêts, les remboursements, les échéances et l'épargne ;
--   7. la carte « Commerce » de la Synthèse.

-- ---------------------------------------------------------------------------
-- 1. Catégorie par défaut « Achat de stock »
-- ---------------------------------------------------------------------------

-- La commerçante qui rachète sa marchandise ne faisait ni des « Courses » ni du « Divers ». Face au revenu « Commerce », elle donne la marge du mois (commerce_summary(), partie 7). Icône absente du seed et de category-icons.ts, pour la même raison que les catégories régionales.
insert into public.categories (group_id, name, icon, type) values
  (null, 'Achat de stock', 'package-variant-closed', 'expense')
on conflict (name, type) where group_id is null do nothing;

-- ---------------------------------------------------------------------------
-- 2. Étiquettes
-- ---------------------------------------------------------------------------

-- Une liste de textes dans l'opération elle-même, plutôt qu'une table d'étiquettes et une table de liaison : l'opération et ses étiquettes partent en une seule écriture, et la file hors ligne n'a rien à enchaîner. Le prix : renommer une étiquette partout n'existe pas.
--
-- Au plus cinq, de 1 à 30 caractères sans espace en bordure, sans doublon à la casse près. La fonction est IMMUTABLE pour pouvoir servir dans une contrainte.
create function public.tags_are_valid(p_tags text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select cardinality(p_tags) <= 5
    and not exists (
      select 1 from unnest(p_tags) as t(tag)
       where t.tag is null or t.tag <> btrim(t.tag) or char_length(t.tag) not between 1 and 30
    )
    and (select count(distinct lower(t.tag)) from unnest(p_tags) as t(tag)) = cardinality(p_tags);
$$;

alter table public.transactions
  add column tags text[] not null default '{}',
  add constraint transactions_tags_valid check (public.tags_are_valid(tags));

-- Le filtre « étiquette » de l'historique cherche par inclusion (`tags @> array[…]`), ce que sert un index GIN.
create index transactions_tags_idx on public.transactions using gin (tags);

grant insert (tags) on public.transactions to authenticated;
grant update (tags) on public.transactions to authenticated;

-- Les étiquettes déjà utilisées dans le groupe, les plus fréquentes d'abord, pour les proposer à la saisie et au filtre. SECURITY INVOKER : transactions_select_member s'applique, un non-membre n'obtient rien.
create function public.transaction_tags(p_group_id uuid)
returns table (tag text, uses integer)
language sql
stable
security invoker
set search_path = public
as $$
  select t.tag, count(*)::integer
    from public.transactions x
   cross join lateral unnest(x.tags) as t(tag)
   where x.group_id = p_group_id
   group by t.tag
   order by count(*) desc, max(x.occurred_on) desc, t.tag
   limit 30;
$$;

revoke all on function public.transaction_tags(uuid) from public, anon;
grant execute on function public.transaction_tags(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le portefeuille d'une opération récurrente
-- ---------------------------------------------------------------------------

-- Le loyer part toujours du compte MoMo, la tontine des espèces : le modèle retient le portefeuille choisi à sa création, et confirm_recurring() s'en sert quand la confirmation n'en demande pas d'autre. NULL : celui par défaut du groupe. Un portefeuille supprimé remet la colonne à NULL plutôt que d'emporter le modèle.
alter table public.recurring_transactions
  add column wallet_id uuid references public.wallets (id) on delete set null;

-- Un portefeuille d'un autre groupe est refusé, comme pour une opération (assign_transaction_wallet()). SECURITY INVOKER : un portefeuille que l'appelant ne voit pas est traité comme étranger, ce qu'il est.
create function public.check_recurring_wallet()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.wallet_id is not null and not exists (
    select 1 from public.wallets where id = new.wallet_id and group_id = new.group_id
  ) then
    raise exception 'Ce portefeuille n''appartient pas à ce budget.';
  end if;
  return new;
end;
$$;

create trigger recurring_transactions_check_wallet
  before insert or update of wallet_id on public.recurring_transactions
  for each row execute function public.check_recurring_wallet();

grant insert (wallet_id) on public.recurring_transactions to authenticated;
grant update (wallet_id) on public.recurring_transactions to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Les filtres de l'historique, en un seul endroit
-- ---------------------------------------------------------------------------

-- daily_totals() et filtered_totals() répétaient chacune la même clause where, et un commentaire demandait de les garder d'accord. Avec trois filtres de plus et une troisième fonction (les sous-totaux par catégorie du relevé PDF), la clause vit désormais ici, une seule fois ; les trois fonctions agrègent ses lignes. Une fonction SQL STABLE et SECURITY INVOKER est dépliée dans la requête qui l'appelle : les index restent utilisés.
--
-- Mêmes règles que listPage() côté app : bornes semi-ouvertes [p_from, p_to), `null` pour ne pas filtrer, recherche par position dans la note, insensible à la casse.
--
-- p_category_id est gardé pour l'app déjà installée, qui ne connaît qu'une catégorie ; p_category_ids (plusieurs catégories) le remplace. Les nouveaux paramètres sont en dernier, avec une valeur par défaut, pour qu'un appel de l'ancienne app trouve toujours la fonction.
create function public.filtered_transactions(
  p_group_id uuid,
  p_from date default null,
  p_to date default null,
  p_type public.transaction_type default null,
  p_category_id uuid default null,
  p_search text default null,
  p_category_ids uuid[] default null,
  p_wallet_id uuid default null,
  p_tag text default null
)
returns setof public.transactions
language sql
stable
security invoker
set search_path = public
as $$
  select t.*
  from public.transactions t
  where t.group_id = p_group_id
    and (p_from is null or t.occurred_on >= p_from)
    and (p_to is null or t.occurred_on < p_to)
    and (p_type is null or t.type = p_type)
    and (p_category_id is null or t.category_id = p_category_id)
    and (p_category_ids is null or t.category_id = any (p_category_ids))
    and (p_wallet_id is null or t.wallet_id = p_wallet_id)
    and (p_tag is null or t.tags @> array[p_tag])
    and (p_search is null or strpos(lower(coalesce(t.note, '')), lower(p_search)) > 0);
$$;

revoke all on function public.filtered_transactions(uuid, date, date, public.transaction_type, uuid, text, uuid[], uuid, text) from public, anon;
grant execute on function public.filtered_transactions(uuid, date, date, public.transaction_type, uuid, text, uuid[], uuid, text) to authenticated;

drop function public.daily_totals(uuid, date, date, public.transaction_type, uuid, text);

create function public.daily_totals(
  p_group_id uuid,
  p_from date default null,
  p_to date default null,
  p_type public.transaction_type default null,
  p_category_id uuid default null,
  p_search text default null,
  p_category_ids uuid[] default null,
  p_wallet_id uuid default null,
  p_tag text default null
)
returns table (occurred_on date, total numeric, tx_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.occurred_on,
    coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0),
    count(*)::integer
  from public.filtered_transactions(p_group_id, p_from, p_to, p_type, p_category_id, p_search, p_category_ids, p_wallet_id, p_tag) t
  group by t.occurred_on
  order by t.occurred_on desc;
$$;

revoke all on function public.daily_totals(uuid, date, date, public.transaction_type, uuid, text, uuid[], uuid, text) from public, anon;
grant execute on function public.daily_totals(uuid, date, date, public.transaction_type, uuid, text, uuid[], uuid, text) to authenticated;

-- Sous-totaux par catégorie des opérations filtrées, dépenses et revenus, pour le relevé PDF. Les opérations sans catégorie (épargne, prêts) forment une ligne à catégorie NULL : le relevé doit additionner jusqu'au total.
create function public.filtered_category_totals(
  p_group_id uuid,
  p_from date default null,
  p_to date default null,
  p_type public.transaction_type default null,
  p_category_id uuid default null,
  p_search text default null,
  p_category_ids uuid[] default null,
  p_wallet_id uuid default null,
  p_tag text default null
)
returns table (category_id uuid, name text, type public.transaction_type, total numeric, tx_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.name, t.type, sum(t.amount), count(*)::integer
  from public.filtered_transactions(p_group_id, p_from, p_to, p_type, p_category_id, p_search, p_category_ids, p_wallet_id, p_tag) t
  left join public.categories c on c.id = t.category_id
  group by c.id, c.name, t.type
  order by t.type, sum(t.amount) desc, c.name nulls last;
$$;

revoke all on function public.filtered_category_totals(uuid, date, date, public.transaction_type, uuid, text, uuid[], uuid, text) from public, anon;
grant execute on function public.filtered_category_totals(uuid, date, date, public.transaction_type, uuid, text, uuid[], uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Vente à crédit
-- ---------------------------------------------------------------------------

-- Le versement d'un client est un revenu « Commerce » lié à sa dette : il porte à la fois debt_id et une catégorie. La contrainte d'origine interdisait ce cumul ; elle ne garde que l'exclusion entre épargne et dette.
--
-- Désormais, un « mouvement de prêt ou de dette » — ni dépense ni revenu, sur sa propre ligne des totaux — est une opération liée à une dette ET sans catégorie. Les versements d'une vente à crédit, catégorisés, comptent comme revenus.
alter table public.transactions
  drop constraint transactions_debt_uncategorized,
  add constraint transactions_debt_not_savings check (debt_id is null or not is_savings);

-- La catégorie « Commerce » que voit le groupe : la sienne s'il en a créé une du même nom (l'app masque alors celle par défaut, hideShadowedDefaults()), sinon celle par défaut.
create function public.commerce_category(p_group_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select id
    from public.categories
   where type = 'income'
     and lower(name) = 'commerce'
     and (group_id = p_group_id or group_id is null)
   order by group_id nulls last
   limit 1;
$$;

revoke all on function public.commerce_category(uuid) from public, anon;
grant execute on function public.commerce_category(uuid) to authenticated;

-- create_debt() : p_wallet_id en plus, et rien au solde pour une vente à crédit. Corps inchangé par ailleurs (20260925000600_debts.sql). La signature change : supprimée puis recréée, droits compris.
drop function public.create_debt(uuid, uuid, public.debt_direction, text, numeric, date, uuid, date, text);

create function public.create_debt(
  p_id uuid,
  p_group_id uuid,
  p_direction public.debt_direction,
  p_counterparty text,
  p_amount numeric,
  p_occurred_on date,
  p_transaction_id uuid,
  p_due_on date default null,
  p_note text default null,
  -- Portefeuille d'où sort le prêt, ou où entre l'emprunt. NULL : celui par défaut du groupe. Ignoré pour une vente à crédit, qui ne déplace rien.
  p_wallet_id uuid default null
)
returns public.debts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  created public.debts;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  select * into created from public.debts where id = p_id;
  if found then
    return created;
  end if;

  if not public.is_group_member(p_group_id) then
    raise exception 'Vous n''avez pas accès à ce budget.';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount) then
    raise exception 'Indiquez un montant entier, supérieur à zéro.';
  end if;

  insert into public.debts (id, group_id, user_id, direction, counterparty, amount, due_on, note)
  values (p_id, p_group_id, v_uid, p_direction, btrim(p_counterparty), p_amount, p_due_on, nullif(btrim(coalesce(p_note, '')), ''))
  returning * into created;

  -- Une vente à crédit ne fait rien entrer le jour de la vente : l'argent arrive avec chaque versement.
  if p_direction = 'credit_sale' then
    return created;
  end if;

  -- Prêter fait sortir l'argent, emprunter le fait entrer. assign_transaction_wallet() refuse un portefeuille d'un autre groupe.
  insert into public.transactions (id, group_id, user_id, type, amount, occurred_on, note, debt_id, wallet_id)
  values (
    p_transaction_id,
    p_group_id,
    v_uid,
    case p_direction when 'lent' then 'expense' else 'income' end::public.transaction_type,
    p_amount,
    coalesce(p_occurred_on, current_date),
    case p_direction when 'lent' then 'Prêt à ' else 'Emprunt à ' end || created.counterparty,
    created.id,
    p_wallet_id
  );

  return created;
end;
$$;

revoke all on function public.create_debt(uuid, uuid, public.debt_direction, text, numeric, date, uuid, date, text, uuid) from public, anon;
grant execute on function public.create_debt(uuid, uuid, public.debt_direction, text, numeric, date, uuid, date, text, uuid) to authenticated;

-- record_debt_payment() : p_wallet_id en plus, et le versement d'une vente à crédit devient un revenu « Commerce ».
drop function public.record_debt_payment(uuid, numeric, date, uuid);

create function public.record_debt_payment(
  p_debt_id uuid,
  p_amount numeric,
  p_occurred_on date,
  p_transaction_id uuid,
  p_wallet_id uuid default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  debt public.debts;
  paid numeric;
  payment_type public.transaction_type;
  created public.transactions;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  select * into created from public.transactions where id = p_transaction_id and debt_id = p_debt_id;
  if found then
    return created;
  end if;

  select * into debt from public.debts where id = p_debt_id for update;
  if not found or not public.is_group_member(debt.group_id) then
    raise exception 'Cette dette n''existe plus.';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount) then
    raise exception 'Indiquez un montant entier, supérieur à zéro.';
  end if;

  -- Être remboursé (prêt, vente à crédit) fait entrer l'argent ; rembourser un emprunt le fait sortir.
  payment_type := case debt.direction when 'borrowed' then 'expense' else 'income' end;

  select coalesce(sum(t.amount), 0) into paid
    from public.transactions t
   where t.debt_id = debt.id
     and t.type = payment_type;

  if p_amount > debt.amount - paid then
    raise exception 'Le remboursement dépasse ce qui reste dû.';
  end if;

  insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on, note, debt_id, wallet_id)
  values (
    p_transaction_id,
    debt.group_id,
    v_uid,
    case when debt.direction = 'credit_sale' then public.commerce_category(debt.group_id) end,
    payment_type,
    p_amount,
    coalesce(p_occurred_on, current_date),
    case debt.direction
      when 'lent' then 'Remboursement de '
      when 'borrowed' then 'Remboursement à '
      else 'Vente à crédit : versement de '
    end || debt.counterparty,
    debt.id,
    p_wallet_id
  )
  returning * into created;

  return created;
end;
$$;

revoke all on function public.record_debt_payment(uuid, numeric, date, uuid, uuid) from public, anon;
grant execute on function public.record_debt_payment(uuid, numeric, date, uuid, uuid) to authenticated;

-- Le remboursé d'une vente à crédit se compte en entrées, comme celui d'un prêt. Même type de retour : un simple remplacement.
create or replace function public.debts_overview(p_group_id uuid)
returns table (
  id uuid,
  direction public.debt_direction,
  counterparty text,
  amount numeric,
  paid numeric,
  remaining numeric,
  due_on date,
  note text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    d.id,
    d.direction,
    d.counterparty,
    d.amount,
    coalesce(p.paid, 0),
    d.amount - coalesce(p.paid, 0),
    d.due_on,
    d.note,
    d.created_at
  from public.debts d
  left join lateral (
    select sum(t.amount) as paid
    from public.transactions t
    where t.debt_id = d.id
      and t.type = case d.direction when 'borrowed' then 'expense' else 'income' end::public.transaction_type
  ) p on true
  where d.group_id = p_group_id
  order by (d.amount - coalesce(p.paid, 0)) = 0, d.due_on nulls last, d.created_at;
$$;

-- « On vous doit » compte aussi les clients : c'est de l'argent attendu, que l'écran range sous leur propre titre.
create or replace function public.debts_totals(p_group_id uuid)
returns table (owed_to_us numeric, we_owe numeric, open_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(o.remaining) filter (where o.direction <> 'borrowed'), 0),
    coalesce(sum(o.remaining) filter (where o.direction = 'borrowed'), 0),
    (count(*) filter (where o.remaining > 0))::integer
  from public.debts_overview(p_group_id) o;
$$;

-- Les totaux : un mouvement de prêt est désormais une opération liée à une dette et sans catégorie. Le versement catégorisé d'une vente à crédit entre dans income. balance = income − expense − savings + debts tient toujours.
create or replace function public.period_summary(
  p_group_id uuid,
  p_from date,
  p_to date
)
returns table (income numeric, expense numeric, savings numeric, debts numeric, balance numeric, tx_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(amount) filter (where type = 'income' and not is_savings and (debt_id is null or category_id is not null)), 0),
    coalesce(sum(amount) filter (where type = 'expense' and not is_savings and (debt_id is null or category_id is not null)), 0),
    coalesce(sum(amount) filter (where type = 'expense' and is_savings), 0)
      - coalesce(sum(amount) filter (where type = 'income' and is_savings), 0),
    coalesce(sum(amount) filter (where type = 'income' and debt_id is not null and category_id is null), 0)
      - coalesce(sum(amount) filter (where type = 'expense' and debt_id is not null and category_id is null), 0),
    coalesce(sum(amount) filter (where type = 'income'), 0)
      - coalesce(sum(amount) filter (where type = 'expense'), 0),
    count(*)::integer
  from public.transactions
  where group_id = p_group_id
    and occurred_on >= p_from
    and occurred_on < p_to;
$$;

drop function public.filtered_totals(uuid, date, date, public.transaction_type, uuid, text);

create function public.filtered_totals(
  p_group_id uuid,
  p_from date default null,
  p_to date default null,
  p_type public.transaction_type default null,
  p_category_id uuid default null,
  p_search text default null,
  p_category_ids uuid[] default null,
  p_wallet_id uuid default null,
  p_tag text default null
)
returns table (income numeric, expense numeric, savings numeric, debts numeric, balance numeric, tx_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(t.amount) filter (where t.type = 'income' and not t.is_savings and (t.debt_id is null or t.category_id is not null)), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense' and not t.is_savings and (t.debt_id is null or t.category_id is not null)), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense' and t.is_savings), 0)
      - coalesce(sum(t.amount) filter (where t.type = 'income' and t.is_savings), 0),
    coalesce(sum(t.amount) filter (where t.type = 'income' and t.debt_id is not null and t.category_id is null), 0)
      - coalesce(sum(t.amount) filter (where t.type = 'expense' and t.debt_id is not null and t.category_id is null), 0),
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0)
      - coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
    count(*)::integer
  from public.filtered_transactions(p_group_id, p_from, p_to, p_type, p_category_id, p_search, p_category_ids, p_wallet_id, p_tag) t;
$$;

revoke all on function public.filtered_totals(uuid, date, date, public.transaction_type, uuid, text, uuid[], uuid, text) from public, anon;
grant execute on function public.filtered_totals(uuid, date, date, public.transaction_type, uuid, text, uuid[], uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Portefeuille au choix : échéances et épargne
-- ---------------------------------------------------------------------------

-- confirm_recurring() : p_wallet_id en plus ; NULL reprend celui du modèle, puis celui par défaut du groupe. Corps inchangé par ailleurs (20260925000500_recurring_and_weekly.sql).
drop function public.confirm_recurring(uuid, date, uuid, numeric, date);

create function public.confirm_recurring(
  p_id uuid,
  p_due_on date,
  p_transaction_id uuid,
  p_amount numeric default null,
  p_occurred_on date default null,
  p_wallet_id uuid default null
)
returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  recurring public.recurring_transactions;
  created public.transactions;
begin
  select * into created from public.transactions where id = p_transaction_id;
  if found then
    return created;
  end if;

  if p_amount is not null and (p_amount <= 0 or p_amount <> round(p_amount)) then
    raise exception 'Indiquez un montant entier, supérieur à zéro.';
  end if;

  select * into recurring
    from public.recurring_transactions
   where id = p_id
     for update;
  if not found then
    raise exception 'Cette opération récurrente n''existe plus.';
  end if;

  if recurring.next_due_on <> p_due_on then
    raise exception 'Cette échéance a déjà été traitée par un autre membre.';
  end if;

  insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on, note, wallet_id)
  values (
    p_transaction_id,
    recurring.group_id,
    auth.uid(),
    recurring.category_id,
    recurring.type,
    coalesce(p_amount, recurring.amount),
    coalesce(p_occurred_on, p_due_on),
    recurring.note,
    coalesce(p_wallet_id, recurring.wallet_id)
  )
  returning * into created;

  update public.recurring_transactions
     set next_due_on = public.next_recurrence(frequency, anchor_day, p_due_on)
   where id = p_id;

  return created;
end;
$$;

revoke all on function public.confirm_recurring(uuid, date, uuid, numeric, date, uuid) from public, anon;
grant execute on function public.confirm_recurring(uuid, date, uuid, numeric, date, uuid) to authenticated;

-- add_to_savings_goal() : p_wallet_id en plus, un portefeuille du compte personnel (assign_transaction_wallet() refuse les autres). Corps inchangé par ailleurs (20260926000400_idempotent_deltas.sql).
drop function public.add_to_savings_goal(uuid, numeric, date, uuid);

create function public.add_to_savings_goal(
  p_goal_id uuid,
  p_delta numeric,
  p_occurred_on date default null,
  p_id uuid default null,
  p_wallet_id uuid default null
)
returns public.savings_goals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  goal public.savings_goals;
  personal_group uuid;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  if p_delta is null or p_delta = 0 or p_delta <> round(p_delta) then
    raise exception 'Indiquez un montant entier, différent de zéro.';
  end if;

  select * into goal
    from public.savings_goals
   where id = p_goal_id
     and user_id = v_uid
     for update;
  if not found then
    raise exception 'Cet objectif n''existe plus.';
  end if;

  if p_id is not null and exists (
    select 1 from public.transactions where id = p_id and savings_goal_id = p_goal_id
  ) then
    return goal;
  end if;

  if goal.current_amount + p_delta < 0 then
    raise exception 'Le retrait dépasse le montant épargné.';
  end if;

  select m.group_id into personal_group
    from public.account_memberships m
    join public.budget_groups g on g.id = m.group_id
   where m.user_id = v_uid
     and g.is_personal;

  insert into public.transactions (id, group_id, user_id, type, amount, occurred_on, note, is_savings, savings_goal_id, wallet_id)
  values (
    coalesce(p_id, gen_random_uuid()),
    personal_group,
    v_uid,
    case when p_delta > 0 then 'expense' else 'income' end::public.transaction_type,
    abs(p_delta),
    coalesce(p_occurred_on, current_date),
    goal.name,
    true,
    goal.id,
    p_wallet_id
  );

  update public.savings_goals
     set current_amount = current_amount + p_delta
   where id = p_goal_id
  returning * into goal;

  return goal;
end;
$$;

revoke all on function public.add_to_savings_goal(uuid, numeric, date, uuid, uuid) from public, anon;
grant execute on function public.add_to_savings_goal(uuid, numeric, date, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Commerce du mois : ventes − stock
-- ---------------------------------------------------------------------------

-- Ventes (revenus « Commerce », versements des ventes à crédit compris), achats de stock et leur différence sur la période, sommés ici comme tous les montants. Par nom plutôt que par identifiant : un groupe qui a créé sa propre « Commerce » la voit à la place de celle par défaut, et ses opérations doivent compter. tx_count dit à l'app s'il y a du commerce dans la période ; sans, la carte ne s'affiche pas.
create function public.commerce_summary(p_group_id uuid, p_from date, p_to date)
returns table (sales numeric, stock numeric, margin numeric, tx_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
    coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0),
    count(*)::integer
  from public.transactions t
  join public.categories c on c.id = t.category_id
  where t.group_id = p_group_id
    and t.occurred_on >= p_from
    and t.occurred_on < p_to
    and (
      (t.type = 'income' and lower(c.name) = 'commerce')
      or (t.type = 'expense' and lower(c.name) = 'achat de stock')
    );
$$;

revoke all on function public.commerce_summary(uuid, date, date) from public, anon;
grant execute on function public.commerce_summary(uuid, date, date) to authenticated;
