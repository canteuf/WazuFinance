-- Wazu Finance — l'épargne sort du solde (spec 2.5 : « lier des versements à l'objectif »)
--
-- Jusqu'ici, un versement sur un objectif ne faisait qu'augmenter savings_goals.current_amount. Le solde de la période et le « par jour » ignoraient donc l'argent mis de côté : un ménage qui épargnait se croyait plus riche qu'il n'était.
--
-- Désormais chaque versement est aussi une opération du compte personnel, marquée `is_savings` : une sortie pour un dépôt, une entrée pour un retrait. Le solde la compte ; les totaux la séparent des dépenses et des revenus, sur une ligne « épargne » à part, pour qu'un versement ne gonfle ni les sorties ni les enveloppes.
--
-- Ce qui était déjà épargné avant cette migration n'a pas d'opération : c'est de l'argent mis de côté avant que l'app ne le suive, et le retirer le fait entrer au solde, ce qui est juste.

-- ---------------------------------------------------------------------------
-- 1. transactions.is_savings
-- ---------------------------------------------------------------------------

-- Un indicateur plutôt que savings_goal_id seul : la clé étrangère passe à NULL quand l'objectif est supprimé (on delete set null), et l'opération redeviendrait une dépense ordinaire, sans catégorie, qui gonflerait après coup les sorties de sa période. Supprimer un objectif ne rend pas l'argent au solde : il a quitté le budget au moment du versement.
--
-- Pas de catégorie : une opération d'épargne n'est pas un poste de dépense. category_breakdown() et budget_totals() l'excluent ainsi d'elles-mêmes, par leur jointure sur les catégories.
alter table public.transactions
  add column is_savings boolean not null default false,
  add constraint transactions_savings_uncategorized check (not is_savings or category_id is null);

-- ---------------------------------------------------------------------------
-- 2. Privilèges par colonne sur transactions
-- ---------------------------------------------------------------------------

-- Seul add_to_savings_goal() crée une opération d'épargne : une opération `is_savings` insérée directement ne toucherait pas au montant de l'objectif, et les deux divergeraient. Le client garde donc toutes les colonnes qu'il avait, sauf is_savings et savings_goal_id.
--
-- Les colonnes figées (id, user_id, group_id, created_at) restent accordées à dessein : guard_immutable_columns() les refuse avec un message qui nomme la colonne, et activity_log_test.sql s'appuie sur ce message pour prouver que c'est le trigger, et non RLS, qui refuse. updated_at aussi : touch_updated_at() ignore la valeur envoyée.
revoke insert, update on public.transactions from authenticated;
grant insert (id, group_id, user_id, category_id, type, amount, occurred_on, note, created_at, updated_at)
  on public.transactions to authenticated;
grant update (id, group_id, user_id, category_id, type, amount, occurred_on, note, created_at, updated_at)
  on public.transactions to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Une opération d'épargne ne se modifie ni ne se supprime depuis l'historique
-- ---------------------------------------------------------------------------

-- Pour la même raison : modifier son montant ou la supprimer désaccorderait l'opération et l'objectif. Un retrait se fait depuis l'objectif, et crée l'opération inverse.
--
-- pg_trigger_depth() = 1 : seule une action directe du client est refusée, comme dans guard_owner_orphan(). Les cascades — suppression du groupe ou du compte, savings_goal_id remis à NULL à la suppression de l'objectif — s'exécutent plus profond et passent.
create function public.guard_savings_movement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_savings and pg_trigger_depth() = 1 then
    raise exception 'Un versement d''épargne se gère depuis son objectif, pas depuis l''historique.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger transactions_guard_savings_movement
  before update or delete on public.transactions
  for each row execute function public.guard_savings_movement();

-- ---------------------------------------------------------------------------
-- 4. add_to_savings_goal() — le versement devient aussi une opération
-- ---------------------------------------------------------------------------

-- Le type de retour et le nom ne changent pas ; un paramètre s'ajoute, avec une valeur par défaut, donc un appel sans lui reste valide. Postgres ne remplace pas une fonction dont la liste d'arguments change : on la supprime d'abord, et les droits sont re-posés plus bas.
drop function public.add_to_savings_goal(uuid, numeric);

-- SECURITY DEFINER, pour une raison qui lui est propre : elle écrit is_savings et savings_goal_id, que le client n'a plus le droit d'écrire (partie 2). En contrepartie, elle ne s'appuie sur aucune policy et vérifie elle-même que l'objectif appartient à l'appelant.
--
-- L'opération va dans le compte personnel de l'appelant, jamais dans un budget partagé : un objectif d'épargne est personnel (savings_goals_all_own), et une ligne « Épargne · Moto » dans le budget du foyer le montrerait aux autres membres.
--
-- `p_occurred_on` vient de l'appareil, comme les bornes de période : le serveur est en UTC et daterait un versement du soir au lendemain.
--
-- La note reprend le nom de l'objectif : c'est elle qui titre la ligne dans l'historique, et elle survit à la suppression de l'objectif.
create function public.add_to_savings_goal(p_goal_id uuid, p_delta numeric, p_occurred_on date default null)
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

  -- Le franc CFA n'a pas de centimes : un montant se saisit en unités entières.
  if p_delta is null or p_delta = 0 or p_delta <> round(p_delta) then
    raise exception 'Indiquez un montant entier, différent de zéro.';
  end if;

  -- `for update` : deux versements simultanés se sérialisent, et le contrôle du solde ci-dessous porte sur la valeur que l'update va vraiment modifier.
  select * into goal
    from public.savings_goals
   where id = p_goal_id
     and user_id = v_uid
     for update;
  if not found then
    -- Même message pour un objectif supprimé et pour celui d'un autre : le distinguer révélerait qu'il existe.
    raise exception 'Cet objectif n''existe plus.';
  end if;

  if goal.current_amount + p_delta < 0 then
    raise exception 'Le retrait dépasse le montant épargné.';
  end if;

  select m.group_id into personal_group
    from public.account_memberships m
    join public.budget_groups g on g.id = m.group_id
   where m.user_id = v_uid
     and g.is_personal;

  insert into public.transactions (group_id, user_id, type, amount, occurred_on, note, is_savings, savings_goal_id)
  values (
    personal_group,
    v_uid,
    case when p_delta > 0 then 'expense' else 'income' end::public.transaction_type,
    abs(p_delta),
    coalesce(p_occurred_on, current_date),
    goal.name,
    true,
    goal.id
  );

  update public.savings_goals
     set current_amount = current_amount + p_delta
   where id = p_goal_id
  returning * into goal;

  return goal;
end;
$$;

revoke all on function public.add_to_savings_goal(uuid, numeric, date) from public, anon;
grant execute on function public.add_to_savings_goal(uuid, numeric, date) to authenticated;

-- Même correction de message pour les plafonds d'enveloppe : « au centime près » n'avait pas de sens en XAF. Corps inchangé par ailleurs (20260919000400_envelopes.sql).
create or replace function public.adjust_budget_amount(p_budget_id uuid, p_delta numeric)
returns public.budgets
language plpgsql
security invoker
set search_path = public
as $$
declare
  budget public.budgets;
begin
  if p_delta is null or p_delta = 0 or p_delta <> round(p_delta) then
    raise exception 'Indiquez un montant entier, différent de zéro.';
  end if;

  select * into budget from public.budgets where id = p_budget_id for update;
  if not found then
    raise exception 'Cette enveloppe n''existe plus.';
  end if;

  if budget.amount + p_delta <= 0 then
    raise exception 'Le plafond doit rester supérieur à zéro.';
  end if;

  update public.budgets
     set amount = amount + p_delta
   where id = p_budget_id
  returning * into budget;

  return budget;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Totaux : l'épargne sur sa propre ligne
-- ---------------------------------------------------------------------------

-- income et expense ne comptent plus que les opérations ordinaires ; savings est l'épargne nette de la période (versements moins retraits) ; balance reste la somme de tout ce qui entre moins tout ce qui sort, donc income − expense − savings. Le type de retour change : la fonction est supprimée puis recréée, et ses droits re-posés.
drop function public.period_summary(uuid, date, date);

create function public.period_summary(
  p_group_id uuid,
  p_from date,
  p_to date
)
returns table (income numeric, expense numeric, savings numeric, balance numeric, tx_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(amount) filter (where type = 'income' and not is_savings), 0),
    coalesce(sum(amount) filter (where type = 'expense' and not is_savings), 0),
    coalesce(sum(amount) filter (where type = 'expense' and is_savings), 0)
      - coalesce(sum(amount) filter (where type = 'income' and is_savings), 0),
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

-- Même découpage pour le relevé exporté, dont les totaux doivent décrire les mêmes lignes que le tableau de bord. Clause where inchangée : elle reste celle de daily_totals().
drop function public.filtered_totals(uuid, date, date, public.transaction_type, uuid, text);

create function public.filtered_totals(
  p_group_id uuid,
  p_from date default null,
  p_to date default null,
  p_type public.transaction_type default null,
  p_category_id uuid default null,
  p_search text default null
)
returns table (income numeric, expense numeric, savings numeric, balance numeric, tx_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(t.amount) filter (where t.type = 'income' and not t.is_savings), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense' and not t.is_savings), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense' and t.is_savings), 0)
      - coalesce(sum(t.amount) filter (where t.type = 'income' and t.is_savings), 0),
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

-- Les montants proposés à la saisie sont des habitudes de dépense : un versement d'épargne répété n'en est pas une, et ne doit pas devenir un raccourci du formulaire. Corps inchangé par ailleurs (20260919000300_ledger.sql).
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
    and t.created_at >= now() - interval '90 days'
  group by t.amount
  having count(*) >= 2
  order by count(*) desc, max(t.created_at) desc
  limit greatest(least(p_limit, 8), 0);
$$;
