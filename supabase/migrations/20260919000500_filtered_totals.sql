-- Wazu Finance — totaux sous filtres, pour l'en-tête du relevé PDF
--
-- period_summary() ne connaît que des bornes obligatoires : il ne peut pas totaliser « les dépenses Alimentation de septembre contenant "marché" », ni l'historique entier. Le relevé exporté reprend pourtant exactement les filtres de l'historique, et ses totaux doivent décrire les lignes qu'il liste. Les additionner côté client passerait par des flottants binaires ; la somme reste donc en base.
--
-- Même clause where que daily_totals(), mêmes paramètres, même sens : bornes semi-ouvertes [p_from, p_to), `null` pour ne pas filtrer, recherche par `strpos` insensible à la casse. Si l'une change, l'autre doit suivre — filtered_totals_test.sql vérifie que les deux comptent les mêmes lignes.
--
-- SECURITY INVOKER, comme daily_totals() et period_summary() : lecture de transactions hors de toute policy, sans récursion ; transactions_select_member s'applique telle quelle, et un non-membre obtient 0/0/0/0.

create function public.filtered_totals(
  p_group_id uuid,
  p_from date default null,
  p_to date default null,
  p_type public.transaction_type default null,
  p_category_id uuid default null,
  p_search text default null
)
returns table (income numeric, expense numeric, balance numeric, tx_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
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
