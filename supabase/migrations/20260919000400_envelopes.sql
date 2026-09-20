-- Wazu Finance — objectifs d'épargne et enveloppes d'après les maquettes (écrans 5 et 6)
--
-- Trois changements :
--   1. une icône par objectif d'épargne ;
--   2. des versements et des ajustements de plafond qui s'ajoutent au montant présent, au lieu de le réécrire ;
--   3. les totaux affichés en tête des deux écrans, sommés par Postgres.
--
-- Toutes les fonctions sont SECURITY INVOKER, comme period_summary() : elles lisent ou mettent à jour des tables depuis l'extérieur de toute policy, sans récursion. savings_goals_all_own et budgets_update_member s'appliquent donc telles quelles, et il n'y a aucun contournement à auditer.

-- ---------------------------------------------------------------------------
-- 1. Icône des objectifs d'épargne
-- ---------------------------------------------------------------------------

-- Un nom d'icône MaterialCommunityIcons, choisi dans une liste courte côté app. La base ne connaît pas cette liste : une icône inconnue retombe sur la tirelire à l'affichage, ce qui ne justifie pas une contrainte à tenir en phase avec le client. La borne de longueur empêche seulement d'y ranger autre chose qu'un nom.
alter table public.savings_goals
  add column icon text not null default 'piggy-bank-outline'
  check (char_length(icon) between 1 and 64);

-- ---------------------------------------------------------------------------
-- 2. Versements et ajustements
-- ---------------------------------------------------------------------------

-- Ajouter à un montant plutôt que le réécrire, et le faire ici plutôt que dans l'app. Le client qui lirait le montant, l'additionnerait et renverrait le résultat perdrait un versement fait entre-temps depuis un autre appareil — ou, pour un budget partagé, l'ajustement d'un autre membre. `current_amount + p_delta` dans un seul update ne perd rien, et l'addition se fait en numeric, sans flottant.
--
-- Les refus sont levés en P0001 avec un message français : data-errors.ts l'affiche tel quel. La contrainte `check` de la table l'aurait refusé aussi, mais avec un 23514 que l'app ne peut traduire que par « Montant invalide ».

create function public.add_to_savings_goal(p_goal_id uuid, p_delta numeric)
returns public.savings_goals
language plpgsql
security invoker
set search_path = public
as $$
declare
  goal public.savings_goals;
begin
  if p_delta is null or p_delta = 0 or p_delta <> round(p_delta, 2) then
    raise exception 'Indiquez un montant non nul, au centime près.';
  end if;

  -- `for update` : deux versements simultanés se sérialisent, et le contrôle du solde ci-dessous porte sur la valeur que l'update va vraiment modifier.
  select * into goal from public.savings_goals where id = p_goal_id for update;
  if not found then
    -- Même message pour un objectif supprimé et pour celui d'un autre : la policy masque le second, et le distinguer révélerait qu'il existe.
    raise exception 'Cet objectif n''existe plus.';
  end if;

  if goal.current_amount + p_delta < 0 then
    raise exception 'Le retrait dépasse le montant épargné.';
  end if;

  update public.savings_goals
     set current_amount = current_amount + p_delta
   where id = p_goal_id
  returning * into goal;

  return goal;
end;
$$;

revoke all on function public.add_to_savings_goal(uuid, numeric) from public, anon;
grant execute on function public.add_to_savings_goal(uuid, numeric) to authenticated;

-- Même principe pour le plafond d'une enveloppe. Un plafond reste strictement positif : on supprime une enveloppe, on ne la ramène pas à zéro. L'update passe par le trigger log_activity(), donc l'ajustement apparaît au journal du groupe avec l'ancien et le nouveau plafond, comme une modification ordinaire.
create function public.adjust_budget_amount(p_budget_id uuid, p_delta numeric)
returns public.budgets
language plpgsql
security invoker
set search_path = public
as $$
declare
  budget public.budgets;
begin
  if p_delta is null or p_delta = 0 or p_delta <> round(p_delta, 2) then
    raise exception 'Indiquez un montant non nul, au centime près.';
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

revoke all on function public.adjust_budget_amount(uuid, numeric) from public, anon;
grant execute on function public.adjust_budget_amount(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Totaux d'en-tête
-- ---------------------------------------------------------------------------

-- Rythme mensuel de chaque objectif en cours qui a une échéance : ce qu'il reste à épargner, réparti sur les mois qui séparent le mois courant de celui de l'échéance. Au moins un mois : une échéance du mois courant, ou déjà passée, demande tout le reste maintenant. Arrondi au centime supérieur, pour qu'épargner le rythme affiché suffise à atteindre la cible.
--
-- `p_today` vient de l'appareil, comme les bornes de période : le serveur est en UTC et changerait de mois quelques heures trop tôt ou trop tard.
--
-- Le rythme de chaque objectif et leur somme viennent de la même fonction, pour que le total en tête d'écran soit exactement la somme des rythmes affichés sur les cartes.
create function public.savings_plans(p_today date)
returns table (goal_id uuid, monthly_rhythm numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    g.id,
    ceil(
      (g.target_amount - g.current_amount)
      / greatest(
          (extract(year from g.target_date) * 12 + extract(month from g.target_date))
          - (extract(year from p_today) * 12 + extract(month from p_today)),
          1
        )
      * 100
    ) / 100
  from public.savings_goals g
  where g.target_date is not null
    and g.current_amount < g.target_amount;
$$;

revoke all on function public.savings_plans(date) from public, anon;
grant execute on function public.savings_plans(date) to authenticated;

-- Total épargné sur tous les objectifs de l'appelant, et effort mensuel : la somme des rythmes de savings_plans(). La policy savings_goals_all_own ne laisse voir que les objectifs de l'appelant, donc aucun filtre sur user_id ici.
create function public.savings_overview(p_today date)
returns table (total_saved numeric, monthly_effort numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select coalesce(sum(g.current_amount), 0) from public.savings_goals g),
    (select coalesce(sum(p.monthly_rhythm), 0) from public.savings_plans(p_today) p);
$$;

revoke all on function public.savings_overview(date) from public, anon;
grant execute on function public.savings_overview(date) to authenticated;

-- Totaux des enveloppes d'un groupe sur une période : la somme des plafonds, et la dépense des seules catégories qui ont une enveloppe. Une dépense hors enveloppe ne consomme aucun plafond, et la compter ferait mentir la barre globale.
--
-- La dépense est définie comme dans category_breakdown() — sorties, bornes [p_from, p_to) —, que l'écran lit déjà pour chaque carte : le total en tête est ainsi la somme exacte des montants affichés dessous.
create function public.budget_totals(p_group_id uuid, p_from date, p_to date)
returns table (spent numeric, ceiling numeric, remaining numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with ceilings as (
    select coalesce(sum(b.amount), 0) as ceiling
    from public.budgets b
    where b.group_id = p_group_id
  ),
  spending as (
    select coalesce(sum(t.amount), 0) as spent
    from public.transactions t
    where t.group_id = p_group_id
      and t.type = 'expense'
      and t.occurred_on >= p_from
      and t.occurred_on < p_to
      and t.category_id in (select b.category_id from public.budgets b where b.group_id = p_group_id)
  )
  select spending.spent, ceilings.ceiling, ceilings.ceiling - spending.spent
  from ceilings, spending;
$$;

revoke all on function public.budget_totals(uuid, date, date) from public, anon;
grant execute on function public.budget_totals(uuid, date, date) to authenticated;
