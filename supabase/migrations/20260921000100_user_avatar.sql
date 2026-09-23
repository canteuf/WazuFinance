-- Wazu Finance — avatar du profil
--
-- L'avatar est l'identifiant d'une image livrée avec l'application (a01 à a16), pas une image téléversée : aucune photo à héberger, à modérer ni à faire transiter par la base. NULL veut dire « pas d'avatar choisi » : l'app affiche alors l'initiale du nom, comme avant cette colonne, si bien qu'aucun compte existant n'est touché.
--
-- Le format est contraint — une lettre, deux chiffres — et non la liste exacte des seize identifiants : ajouter un avatar dans une version future ne doit pas exiger une migration, et l'app retombe de toute façon sur l'initiale devant un identifiant qu'elle ne connaît pas.
alter table public.users
  add column avatar text
  constraint users_avatar_format check (avatar ~ '^a[0-9]{2}$');

comment on column public.users.avatar is
  'Identifiant de l''avatar choisi (a01 à a16), ou NULL pour les initiales du nom. L''image elle-même est livrée avec l''application.';

-- Un privilège par colonne, comme pour display_name (20260919000100_account_settings.sql) : sans lui, l'app reçoit 42501 en écrivant son propre avatar. Les policies existantes suffisent pour le reste — users_update_self limite l'écriture à sa propre ligne, et users_select_self_or_covisible fait lire l'avatar aux membres d'un même groupe, ce qui est voulu : c'est ce qui les fait apparaître sur les piles de membres.
grant update (avatar) on public.users to authenticated;

-- group_overviews() rend aussi l'avatar des trois premiers membres. `create or replace` ne peut pas changer les colonnes qu'une fonction renvoie : elle est supprimée puis recréée, avec ses droits. Rien d'autre n'en dépend.
drop function public.group_overviews();

create function public.group_overviews()
returns table (
  group_id uuid,
  member_count integer,
  monthly_budget numeric,
  member_names text[],
  member_avatars text[],
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
             limit 3) as member_names,
      -- Même jointure, même tri, même limite que member_names : les deux tableaux se lisent en parallèle, le deuxième nom avec le deuxième avatar. Un NULL dans le tableau veut dire « pas d'avatar choisi ».
      array(select u.avatar
              from public.account_memberships m
              join public.users u on u.id = m.user_id
             where m.group_id = g.id
             order by m.created_at, u.id
             limit 3) as member_avatars
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
    member_avatars,
    coalesce(sum(monthly_budget) filter (where not is_personal) over (), 0)
  from mine;
$$;

revoke all on function public.group_overviews() from public, anon;
grant execute on function public.group_overviews() to authenticated;

comment on function public.group_overviews() is
  'Pour chaque groupe de l''appelant : nombre de membres, total des plafonds mensuels, trois premiers noms et leurs avatars (mêmes positions), et total des plafonds mensuels des groupes partagés.';
