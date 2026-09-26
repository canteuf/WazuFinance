-- Wazu Finance — un versement ou un ajustement renvoyé ne compte qu'une fois
--
-- add_to_savings_goal() et adjust_budget_amount() ajoutent un écart au montant en place : c'est ce qui fait compter deux ajustements simultanés. Mais un même geste envoyé deux fois comptait aussi deux fois : réponse perdue sur un réseau faible, l'utilisateur retouche « Verser », et l'objectif prenait deux fois le montant — avec deux opérations d'épargne au solde.
--
-- Chaque geste porte désormais un identifiant tiré par l'app, comme une saisie, une dette ou un transfert. Un renvoi du même identifiant ne change rien et rend l'état actuel. Le paramètre est facultatif et vient en dernier : une version de l'app qui ne l'envoie pas garde l'ancien comportement.

-- ---------------------------------------------------------------------------
-- 1. applied_requests — les gestes déjà appliqués
-- ---------------------------------------------------------------------------

-- Un ajustement de plafond ne laisse aucune ligne derrière lui, contrairement à un versement (son opération) : il faut une trace pour reconnaître un renvoi. Aucun privilège client : seule claim_request() écrit ici.
create table public.applied_requests (
  id         uuid primary key,
  user_id    uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index applied_requests_user_created_idx on public.applied_requests (user_id, created_at);

alter table public.applied_requests enable row level security;
revoke all on public.applied_requests from anon, authenticated;

-- Vrai la première fois qu'un identifiant est présenté, faux ensuite. Si le geste échoue plus loin (plafond qui tomberait à zéro), la transaction entière est annulée, marque comprise, et le renvoi corrigé passe.
--
-- SECURITY DEFINER : applied_requests n'est lisible ni modifiable par aucun client, et adjust_budget_amount() est SECURITY INVOKER. L'appeler directement ne sert à rien d'autre qu'à neutraliser ses propres gestes futurs, dont l'identifiant est aléatoire.
--
-- Les marques de plus de 30 jours de l'appelant sont effacées au passage : un renvoi arrive dans les minutes qui suivent, ou au plus tard avec la file hors ligne, qui ne garde rien au-delà de 30 jours.
create function public.claim_request(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  delete from public.applied_requests
   where user_id = auth.uid()
     and created_at < now() - interval '30 days';

  insert into public.applied_requests (id, user_id)
  values (p_id, auth.uid())
  on conflict (id) do nothing;

  return found;
end;
$$;

revoke all on function public.claim_request(uuid) from public, anon;
grant execute on function public.claim_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. adjust_budget_amount(p_budget_id, p_delta, p_id)
-- ---------------------------------------------------------------------------

-- La liste d'arguments change : Postgres ne remplace pas la fonction, on la supprime et on re-pose les droits. Corps inchangé par ailleurs (20260925000400_budget_wording.sql).
drop function public.adjust_budget_amount(uuid, numeric);

create function public.adjust_budget_amount(p_budget_id uuid, p_delta numeric, p_id uuid default null)
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
    raise exception 'Ce budget n''existe plus.';
  end if;

  -- Après le verrou : deux envois du même geste se sérialisent, et le second trouve la marque du premier.
  if p_id is not null and not public.claim_request(p_id) then
    return budget;
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

revoke all on function public.adjust_budget_amount(uuid, numeric, uuid) from public, anon;
grant execute on function public.adjust_budget_amount(uuid, numeric, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. add_to_savings_goal(p_goal_id, p_delta, p_occurred_on, p_id)
-- ---------------------------------------------------------------------------

-- p_id devient l'identifiant de l'opération d'épargne : elle existe déjà si le geste a été appliqué, sans table de plus. Corps inchangé par ailleurs (20260925000200_savings_movements.sql).
drop function public.add_to_savings_goal(uuid, numeric, date);

create function public.add_to_savings_goal(
  p_goal_id uuid,
  p_delta numeric,
  p_occurred_on date default null,
  p_id uuid default null
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

  -- Après le verrou, comme pour les plafonds : le second envoi attend le premier, puis trouve son opération.
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

  insert into public.transactions (id, group_id, user_id, type, amount, occurred_on, note, is_savings, savings_goal_id)
  values (
    coalesce(p_id, gen_random_uuid()),
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

revoke all on function public.add_to_savings_goal(uuid, numeric, date, uuid) from public, anon;
grant execute on function public.add_to_savings_goal(uuid, numeric, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. budget_groups dans la publication Realtime
-- ---------------------------------------------------------------------------

-- Sans rapport avec les écarts, mais du même audit : un propriétaire qui change le jour de début de période ne le faisait voir aux autres membres qu'à leur prochain rechargement, et leurs totaux décrivaient une autre période que les siens. budget_groups_select_member s'applique aux messages comme aux lectures.
alter publication supabase_realtime add table public.budget_groups;
