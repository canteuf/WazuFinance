-- Wazu Finance — répartition des dépenses par catégorie (spec 2.6)
--
-- Le tableau de bord montre où part l'argent sur la période en cours. La somme
-- est faite par Postgres pour la même raison que period_summary : la base
-- stocke du numeric(12,2), additionné exactement, là où JavaScript passerait
-- par des flottants binaires.

-- security invoker, comme period_summary : la fonction lit transactions depuis
-- l'extérieur de toute policy, donc transactions_select_member s'applique telle
-- quelle et il n'y a aucun contournement à auditer. Un non-membre ne voit aucune
-- ligne et obtient un résultat vide.
--
-- La jointure sur categories est interne : une transaction dont la catégorie a
-- été supprimée (category_id devenu null) n'apparaît pas. C'est voulu — une
-- part « Sans catégorie » dans un graphique de répartition n'apprend rien, et
-- le total des sorties reste disponible dans period_summary.
--
-- Bornes semi-ouvertes [p_from, p_to), passées par l'appelant, jamais dérivées
-- de now() : le serveur est en UTC et se tromperait de période pendant les
-- premières heures du jour de bascule.
--
-- Le tri décroissant sur le total place les plus grosses parts en tête : c'est
-- l'ordre d'affichage, et le faire ici évite de retrier côté client.
create or replace function public.category_breakdown(
  p_group_id uuid,
  p_from date,
  p_to date
)
returns table (
  category_id uuid,
  name text,
  icon text,
  total numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.icon,
    sum(t.amount)
  from public.transactions t
  join public.categories c on c.id = t.category_id
  where t.group_id = p_group_id
    and t.type = 'expense'
    and t.occurred_on >= p_from
    and t.occurred_on < p_to
  group by c.id, c.name, c.icon
  order by sum(t.amount) desc, c.name asc;
$$;

revoke all on function public.category_breakdown(uuid, date, date) from public, anon;
grant execute on function public.category_breakdown(uuid, date, date) to authenticated;
