-- Wazu Finance — aperçu des groupes (écran 7, « Mes groupes »)
--
-- La liste des groupes affiche, pour chacun, son nombre de membres, le total de ses plafonds mensuels et les initiales de ses premiers membres, puis en tête le total engagé dans les groupes partagés. Tout est calculé ici, en une requête : les montants sont du numeric(12,2), que Postgres additionne exactement là où JavaScript passerait par des flottants binaires, et un appel par groupe ferait N allers-retours pour un écran.
--
-- SECURITY INVOKER : la fonction lit budget_groups, account_memberships, budgets et users depuis l'extérieur de toute policy, donc sans récursion — même raisonnement que period_summary(). Les policies s'appliquent telles quelles et suffisent : l'appelant voit les adhésions et les budgets des groupes dont il est membre (is_group_member), et le nom des utilisateurs avec qui il partage un groupe (users_select_self_or_covisible). Un non-membre n'obtient aucune ligne.
--
-- Seuls les plafonds mensuels entrent dans le total : additionner un plafond hebdomadaire à un plafond mensuel donnerait un chiffre qui ne correspond à aucune période. L'écran le présente comme « budgété ce mois ».
--
-- Le total « engagé en commun » ne compte que les groupes partagés : le compte personnel n'est commun à personne. Répété sur chaque ligne par une fonction de fenêtre, pour tenir en une seule requête sans que le client ait à additionner quoi que ce soit.
create function public.group_overviews()
returns table (
  group_id uuid,
  member_count integer,
  monthly_budget numeric,
  member_names text[],
  shared_monthly_total numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with mine as (
    select
      g.id,
      g.is_personal,
      (select count(*)::integer
         from public.account_memberships m
        where m.group_id = g.id) as member_count,
      coalesce((select sum(b.amount)
                  from public.budgets b
                 where b.group_id = g.id
                   and b.period = 'monthly'), 0) as monthly_budget,
      -- Les trois premiers arrivés : l'écran n'en montre pas plus, et un « +N » dit le reste à partir de member_count.
      array(select u.display_name
              from public.account_memberships m
              join public.users u on u.id = m.user_id
             where m.group_id = g.id
             order by m.created_at, u.id
             limit 3) as member_names
    from public.budget_groups g
    where exists (
      select 1 from public.account_memberships me
       where me.group_id = g.id and me.user_id = auth.uid()
    )
  )
  select
    id,
    member_count,
    monthly_budget,
    member_names,
    coalesce(sum(monthly_budget) filter (where not is_personal) over (), 0)
  from mine;
$$;

revoke all on function public.group_overviews() from public, anon;
grant execute on function public.group_overviews() to authenticated;

comment on function public.group_overviews() is
  'Pour chaque groupe de l''appelant : nombre de membres, total des plafonds mensuels, trois premiers noms, et total des plafonds mensuels des groupes partagés.';
