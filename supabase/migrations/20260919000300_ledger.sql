-- Wazu Finance — historique en livre de comptes (écran 3) et montants fréquents (écran 4)
--
-- Deux fonctions, toutes deux SECURITY INVOKER pour la même raison que period_summary() : elles lisent transactions depuis l'extérieur de toute policy, sans récursion, et transactions_select_member s'applique telle quelle. Un non-membre obtient zéro ligne, ce qui n'est pas une erreur.

-- ---------------------------------------------------------------------------
-- daily_totals — solde et nombre d'écritures de chaque jour, pour les filtres affichés
-- ---------------------------------------------------------------------------

-- L'historique groupe les opérations par jour et affiche en tête de chaque jour son total. Ce total ne peut pas venir du client : les montants sont du numeric(12,2), que JavaScript additionnerait en flottants binaires, et la liste est paginée — un jour à cheval sur deux pages aurait un total faux tant que la seconde n'est pas chargée. Ici le total porte sur toutes les opérations du jour, chargées ou non.
--
-- Mêmes filtres que listPage(), dans le même sens : bornes semi-ouvertes [p_from, p_to), `null` pour ne pas filtrer. La recherche porte sur la note, insensible à la casse, par position plutôt que par motif : `strpos` ne donne aucun sens spécial à « % » ou « _ », là où un `ilike` en ferait des jokers. Le client échappe ces deux caractères avant son propre `ilike`, pour que la liste et les totaux décrivent les mêmes lignes.
--
-- Le total est signé : entrées en positif, sorties en négatif, ce qu'affiche l'en-tête de jour (« − 48,30 € »).
create function public.daily_totals(
  p_group_id uuid,
  p_from date default null,
  p_to date default null,
  p_type public.transaction_type default null,
  p_category_id uuid default null,
  p_search text default null
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
  from public.transactions t
  where t.group_id = p_group_id
    and (p_from is null or t.occurred_on >= p_from)
    and (p_to is null or t.occurred_on < p_to)
    and (p_type is null or t.type = p_type)
    and (p_category_id is null or t.category_id = p_category_id)
    and (p_search is null or strpos(lower(coalesce(t.note, '')), lower(p_search)) > 0)
  group by t.occurred_on
  order by t.occurred_on desc;
$$;

revoke all on function public.daily_totals(uuid, date, date, public.transaction_type, uuid, text) from public, anon;
grant execute on function public.daily_totals(uuid, date, date, public.transaction_type, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- frequent_amounts — les montants que l'appelant saisit le plus souvent
-- ---------------------------------------------------------------------------

-- La saisie propose quelques montants en un appui. Des valeurs fixes ne correspondraient aux habitudes de personne ; celles-ci sont les montants que l'appelant a lui-même saisis le plus souvent dans ce groupe, pour ce type — le café du matin devient un appui.
--
-- Seules les saisies de l'appelant comptent, même dans un groupe partagé : ce sont ses habitudes, pas celles de ses colocataires. Un montant saisi une seule fois n'est pas une habitude et n'est pas proposé. Les 90 derniers jours seulement, pour qu'un ancien loyer ne reste pas en tête après un déménagement ; départage par la saisie la plus récente.
create function public.frequent_amounts(
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
    and t.created_at >= now() - interval '90 days'
  group by t.amount
  having count(*) >= 2
  order by count(*) desc, max(t.created_at) desc
  limit greatest(least(p_limit, 8), 0);
$$;

revoke all on function public.frequent_amounts(uuid, public.transaction_type, integer) from public, anon;
grant execute on function public.frequent_amounts(uuid, public.transaction_type, integer) to authenticated;
