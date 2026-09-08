-- Wazu Finance — résumé de la période budgétaire (écran 2)
--
-- Le tableau de bord affiche entrées, sorties et solde sur la période en
-- cours. La somme est faite par Postgres et non par le client : la base stocke
-- du numeric(12,2), que Postgres additionne exactement, là où JavaScript
-- passerait par des flottants binaires — un écart d'un centime qui apparaît et
-- disparaît selon les lignes est introuvable a posteriori.

-- ---------------------------------------------------------------------------
-- period_start_day — jour de démarrage de la période budgétaire
-- ---------------------------------------------------------------------------

-- Porté par le groupe et non par l'utilisateur : dans un budget partagé, deux
-- membres qui parlent du même « ce mois-ci » doivent voir les mêmes chiffres.
-- Conséquence heureuse, la policy budget_groups_update_owner s'applique déjà :
-- seul le propriétaire du groupe peut décaler la période.
--
-- Plafonné à 28 : le 29, le 30 et le 31 n'existent pas tous les mois, et une
-- période démarrant le 31 sauterait silencieusement en février. La contrainte
-- vit ici, pas dans un formulaire, pour valoir quel que soit le client.
alter table public.budget_groups
  add column period_start_day smallint not null default 1
    check (period_start_day between 1 and 28);

comment on column public.budget_groups.period_start_day is
  'Jour du mois où démarre la période budgétaire (1 à 28). 1 = mois calendaire.';

-- ---------------------------------------------------------------------------
-- period_summary — totaux d'une période, pour un groupe
-- ---------------------------------------------------------------------------

-- security invoker, à l'inverse des helpers de 20260904000200. Ceux-là sont
-- definer parce qu'une policy posée sur account_memberships qui interroge
-- account_memberships récurse à l'infini. Ici il n'y a aucune récursion : la
-- fonction lit transactions depuis l'extérieur de toute policy. La policy
-- transactions_select_member s'applique donc telle quelle, et il n'y a aucun
-- contournement de sécurité à auditer. Prendre definer par mimétisme serait
-- exactement l'erreur à éviter.
--
-- Un non-membre ne voit aucune ligne et obtient 0/0/0 — pas une erreur, et
-- aucune information sur l'existence du groupe.
--
-- Les bornes viennent de l'appelant, jamais de now() : le serveur est en UTC.
-- Le 1er octobre à 00 h 30 à Paris il est encore le 30 septembre côté serveur,
-- et date_trunc('month', now()) répondrait « septembre » pendant que
-- l'appareil affiche octobre. Passer les bornes aligne le calcul sur le fuseau
-- de l'appareil, et rend la fonction testable avec des dates fixes.
--
-- Intervalle semi-ouvert [p_from, p_to) : supprime la classe de bugs
-- « 30 ou 31 jours », et février cesse d'être un cas particulier.
create or replace function public.period_summary(
  p_group_id uuid,
  p_from date,
  p_to date
)
returns table (income numeric, expense numeric, balance numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(amount) filter (where type = 'income'), 0),
    coalesce(sum(amount) filter (where type = 'expense'), 0),
    coalesce(sum(amount) filter (where type = 'income'), 0)
      - coalesce(sum(amount) filter (where type = 'expense'), 0)
  from public.transactions
  where group_id = p_group_id
    and occurred_on >= p_from
    and occurred_on < p_to;
$$;

revoke all on function public.period_summary(uuid, date, date) from public, anon;
grant execute on function public.period_summary(uuid, date, date) to authenticated;
