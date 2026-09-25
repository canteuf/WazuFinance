-- Wazu Finance — prêts et dettes entre proches
--
-- Le prêt au cousin et l'avance du boutiquier sont la première cause de trous dans un budget en zone CFA, et l'app n'avait aucun moyen de les suivre : un prêt se saisissait comme une dépense, son remboursement comme un revenu qu'aucune créance ne rapprochait.
--
-- Une dette appartient à un groupe, comme une opération : un prêt saisi dans le compte personnel reste privé, une dette du foyer saisie dans un budget partagé est visible et remboursable par tous ses membres.
--
-- Chaque mouvement d'argent est aussi une opération du groupe, liée à la dette par debt_id : le prêt ou l'emprunt de départ, puis chaque remboursement. Le solde les compte — prêter fait baisser ce qu'on a en poche —, mais les totaux les séparent des dépenses et des revenus, sur une ligne à part : prêter n'est pas dépenser, être remboursé n'est pas gagner. Même construction que l'épargne (20260925000200_savings_movements.sql).

-- ---------------------------------------------------------------------------
-- 1. debts
-- ---------------------------------------------------------------------------

-- lent : j'ai prêté, on me doit. borrowed : j'ai emprunté, je dois.
create type public.debt_direction as enum ('lent', 'borrowed');

-- counterparty est un nom libre, pas un utilisateur de l'app : le cousin, la tante ou le boutiquier n'ont pas de compte. amount est le montant de départ ; ce qui reste dû se calcule en base à partir des remboursements (debts_overview()), jamais stocké, pour qu'il ne puisse pas diverger des mouvements.
create table public.debts (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.budget_groups (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  direction    public.debt_direction not null,
  counterparty text not null check (counterparty = btrim(counterparty) and char_length(counterparty) between 1 and 60),
  amount       numeric(12, 2) not null check (amount > 0 and amount = round(amount)),
  due_on       date,
  note         text check (note is null or char_length(note) <= 120),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index debts_group_id_idx on public.debts (group_id);

create trigger debts_touch_updated_at
  before update on public.debts
  for each row execute function public.touch_updated_at();

alter table public.debts enable row level security;

create policy "debts_select_member"
  on public.debts for select to authenticated
  using (public.is_group_member(group_id));

create policy "debts_update_member"
  on public.debts for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

create policy "debts_delete_member"
  on public.debts for delete to authenticated
  using (public.is_group_member(group_id));

-- Pas d'insert direct : create_debt() crée la dette et son premier mouvement ensemble, sans quoi l'une pourrait exister sans l'autre. En modification, seuls le nom, l'échéance et la note : changer le montant ou le sens désaccorderait la dette de ses mouvements.
revoke all on public.debts from anon, authenticated;
grant select, delete on public.debts to authenticated;
grant update (counterparty, due_on, note) on public.debts to authenticated;

-- ---------------------------------------------------------------------------
-- 2. transactions.debt_id
-- ---------------------------------------------------------------------------

-- on delete cascade, à l'inverse de l'épargne : supprimer une dette revient à dire qu'elle a été saisie par erreur, et ses mouvements doivent quitter le solde avec elle. Une dette réelle qu'on renonce à récupérer se solde, elle ne se supprime pas.
--
-- Pas de catégorie, comme l'épargne : category_breakdown() et budget_totals() l'excluent d'eux-mêmes par leur jointure sur les catégories. Jamais épargne et dette à la fois.
--
-- Aucun privilège n'est accordé au client sur cette colonne : les grants par colonne de 20260925000200_savings_movements.sql ne la citent pas, et seules les fonctions ci-dessous l'écrivent.
alter table public.transactions
  add column debt_id uuid references public.debts (id) on delete cascade,
  add constraint transactions_debt_uncategorized check (debt_id is null or (category_id is null and not is_savings));

create index transactions_debt_id_idx on public.transactions (debt_id) where debt_id is not null;

-- Un mouvement de dette ne se modifie ni ne se supprime depuis l'historique : il désaccorderait la dette et ce qui en reste dû. pg_trigger_depth() = 1 : seule une action directe du client est refusée ; la suppression en cascade d'une dette, d'un groupe ou d'un compte passe.
create function public.guard_debt_movement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.debt_id is not null and pg_trigger_depth() = 1 then
    raise exception 'Un mouvement de prêt ou de dette se gère depuis l''écran Prêts et dettes, pas depuis l''historique.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger transactions_guard_debt_movement
  before update or delete on public.transactions
  for each row execute function public.guard_debt_movement();

-- ---------------------------------------------------------------------------
-- 3. Création et remboursement
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER, pour la même raison que add_to_savings_goal() : elles écrivent debt_id, que le client n'a pas le droit d'écrire. En contrepartie, chacune vérifie elle-même l'appartenance au groupe.
--
-- Les identifiants viennent de l'app, comme pour une saisie ordinaire : un renvoi après une réponse perdue retrouve la dette ou le remboursement déjà créés au lieu d'en créer un second.
--
-- p_occurred_on vient de l'appareil : le serveur est en UTC.
create function public.create_debt(
  p_id uuid,
  p_group_id uuid,
  p_direction public.debt_direction,
  p_counterparty text,
  p_amount numeric,
  p_occurred_on date,
  p_transaction_id uuid,
  -- Facultatifs, donc en dernier : seuls les derniers paramètres d'une fonction peuvent avoir une valeur par défaut.
  p_due_on date default null,
  p_note text default null
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

  -- Prêter fait sortir l'argent, emprunter le fait entrer.
  insert into public.transactions (id, group_id, user_id, type, amount, occurred_on, note, debt_id)
  values (
    p_transaction_id,
    p_group_id,
    v_uid,
    case p_direction when 'lent' then 'expense' else 'income' end::public.transaction_type,
    p_amount,
    coalesce(p_occurred_on, current_date),
    case p_direction when 'lent' then 'Prêt à ' else 'Emprunt à ' end || created.counterparty,
    created.id
  );

  return created;
end;
$$;

revoke all on function public.create_debt(uuid, uuid, public.debt_direction, text, numeric, date, uuid, date, text) from public, anon;
grant execute on function public.create_debt(uuid, uuid, public.debt_direction, text, numeric, date, uuid, date, text) to authenticated;

-- Un remboursement, partiel ou total. Il ne peut pas dépasser ce qui reste dû : un trop-perçu n'a pas de sens pour une dette, et le laisser passer rendrait le reste négatif. Le `for update` sur la dette sérialise deux remboursements simultanés, pour que le contrôle porte sur le reste réel.
create function public.record_debt_payment(
  p_debt_id uuid,
  p_amount numeric,
  p_occurred_on date,
  p_transaction_id uuid
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
  -- Même message pour une dette supprimée et pour celle d'un groupe dont on n'est pas membre : le distinguer révélerait qu'elle existe.
  if not found or not public.is_group_member(debt.group_id) then
    raise exception 'Cette dette n''existe plus.';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount) then
    raise exception 'Indiquez un montant entier, supérieur à zéro.';
  end if;

  -- Déjà remboursé : les mouvements de sens inverse au mouvement de départ.
  select coalesce(sum(t.amount), 0) into paid
    from public.transactions t
   where t.debt_id = debt.id
     and t.type = case debt.direction when 'lent' then 'income' else 'expense' end::public.transaction_type;

  if p_amount > debt.amount - paid then
    raise exception 'Le remboursement dépasse ce qui reste dû.';
  end if;

  -- Être remboursé fait entrer l'argent, rembourser le fait sortir.
  insert into public.transactions (id, group_id, user_id, type, amount, occurred_on, note, debt_id)
  values (
    p_transaction_id,
    debt.group_id,
    v_uid,
    case debt.direction when 'lent' then 'income' else 'expense' end::public.transaction_type,
    p_amount,
    coalesce(p_occurred_on, current_date),
    case debt.direction when 'lent' then 'Remboursement de ' else 'Remboursement à ' end || debt.counterparty,
    debt.id
  )
  returning * into created;

  return created;
end;
$$;

revoke all on function public.record_debt_payment(uuid, numeric, date, uuid) from public, anon;
grant execute on function public.record_debt_payment(uuid, numeric, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ce qui reste dû, sommé en base
-- ---------------------------------------------------------------------------

-- Une ligne par dette du groupe, avec le remboursé et le reste. SECURITY INVOKER : debts_select_member et transactions_select_member s'appliquent telles quelles, et un non-membre n'obtient aucune ligne.
create function public.debts_overview(p_group_id uuid)
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
      and t.type = case d.direction when 'lent' then 'income' else 'expense' end::public.transaction_type
  ) p on true
  where d.group_id = p_group_id
  order by (d.amount - coalesce(p.paid, 0)) = 0, d.due_on nulls last, d.created_at;
$$;

revoke all on function public.debts_overview(uuid) from public, anon;
grant execute on function public.debts_overview(uuid) to authenticated;

-- Ce qu'on doit au groupe et ce qu'il doit, restes additionnés, pour la carte de la Synthèse. Sommé ici et non dans l'app, comme tous les montants (numeric exact, pas de flottant). Même définition du reste que debts_overview(), dont elle additionne les lignes.
create function public.debts_totals(p_group_id uuid)
returns table (owed_to_us numeric, we_owe numeric, open_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(o.remaining) filter (where o.direction = 'lent'), 0),
    coalesce(sum(o.remaining) filter (where o.direction = 'borrowed'), 0),
    (count(*) filter (where o.remaining > 0))::integer
  from public.debts_overview(p_group_id) o;
$$;

revoke all on function public.debts_totals(uuid) from public, anon;
grant execute on function public.debts_totals(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Totaux : les prêts et dettes sur leur propre ligne
-- ---------------------------------------------------------------------------

-- income et expense excluent désormais aussi les mouvements de dette ; debts est leur solde net, signé comme une entrée (positif quand plus d'argent est entré qu'il n'en est sorti par les prêts et dettes de la période) ; balance reste tout ce qui entre moins tout ce qui sort. Donc balance = income − expense − savings + debts. Le type de retour change : les fonctions sont supprimées puis recréées, droits compris.
drop function public.period_summary(uuid, date, date);

create function public.period_summary(
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
    coalesce(sum(amount) filter (where type = 'income' and not is_savings and debt_id is null), 0),
    coalesce(sum(amount) filter (where type = 'expense' and not is_savings and debt_id is null), 0),
    coalesce(sum(amount) filter (where type = 'expense' and is_savings), 0)
      - coalesce(sum(amount) filter (where type = 'income' and is_savings), 0),
    coalesce(sum(amount) filter (where type = 'income' and debt_id is not null), 0)
      - coalesce(sum(amount) filter (where type = 'expense' and debt_id is not null), 0),
    coalesce(sum(amount) filter (where type = 'income'), 0)
      - coalesce(sum(amount) filter (where type = 'expense'), 0),
    count(*)::integer
  from public.transactions
  where group_id = p_group_id
    and occurred_on >= p_from
    and occurred_on < p_to;
$$;

revoke all on function public.period_summary(uuid, date, date) from public, anon;
grant execute on function public.period_summary(uuid, date, date) to authenticated;

drop function public.filtered_totals(uuid, date, date, public.transaction_type, uuid, text);

create function public.filtered_totals(
  p_group_id uuid,
  p_from date default null,
  p_to date default null,
  p_type public.transaction_type default null,
  p_category_id uuid default null,
  p_search text default null
)
returns table (income numeric, expense numeric, savings numeric, debts numeric, balance numeric, tx_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(t.amount) filter (where t.type = 'income' and not t.is_savings and t.debt_id is null), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense' and not t.is_savings and t.debt_id is null), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense' and t.is_savings), 0)
      - coalesce(sum(t.amount) filter (where t.type = 'income' and t.is_savings), 0),
    coalesce(sum(t.amount) filter (where t.type = 'income' and t.debt_id is not null), 0)
      - coalesce(sum(t.amount) filter (where t.type = 'expense' and t.debt_id is not null), 0),
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0)
      - coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
    count(*)::integer
  from public.transactions t
  where t.group_id = p_group_id
    and (p_from is null or t.occurred_on >= p_from)
    and (p_to is null or t.occurred_on < p_to)
    and (p_type is null or t.type = p_type)
    and (p_category_id is null or t.category_id = p_category_id)
    and (p_search is null or strpos(lower(coalesce(t.note, '')), lower(p_search)) > 0);
$$;

revoke all on function public.filtered_totals(uuid, date, date, public.transaction_type, uuid, text) from public, anon;
grant execute on function public.filtered_totals(uuid, date, date, public.transaction_type, uuid, text) to authenticated;

-- Un prêt n'est pas une habitude de dépense, pas plus qu'un versement d'épargne : exclu des montants proposés à la saisie. Corps inchangé par ailleurs (20260925000200_savings_movements.sql).
create or replace function public.frequent_amounts(
  p_group_id uuid,
  p_type public.transaction_type,
  p_limit integer default 4
)
returns table (amount numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select t.amount
  from public.transactions t
  where t.group_id = p_group_id
    and t.user_id = auth.uid()
    and t.type = p_type
    and not t.is_savings
    and t.debt_id is null
    and t.created_at >= now() - interval '90 days'
  group by t.amount
  having count(*) >= 2
  order by count(*) desc, max(t.created_at) desc
  limit greatest(least(p_limit, 8), 0);
$$;
