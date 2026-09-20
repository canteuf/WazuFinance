-- Wazu Finance — nombre d'opérations dans le résumé de période (écran 2)
--
-- Le tableau de bord annonce « 23 opérations » sous le total des sorties. Le compte est fait ici plutôt que côté client pour la même raison que les sommes : rapatrier les lignes uniquement pour les compter ferait voyager toute la période sur le réseau, alors que la fonction les parcourt déjà.
--
-- La signature d'appel ne change pas, seul le type de retour gagne une colonne. Les clients qui lisent income, expense et balance par leur nom ne voient pas la différence — le test pgTAP existant les sélectionne ainsi et continue de passer sans retouche.
--
-- Postgres refuse de remplacer une fonction dont le type de retour change, y compris pour un simple ajout de colonne à un returns table. On la supprime donc d'abord. Les droits sont re-posés plus bas : un drop les emporte, et une fonction sans revoke serait exécutable par anon.
drop function if exists public.period_summary(uuid, date, date);

-- Tout le reste est inchangé, et pour les mêmes raisons qu'à la création (20260908000100) : security invoker parce qu'il n'y a aucune récursion à éviter, bornes venant de l'appelant parce que le serveur est en UTC, intervalle semi-ouvert pour supprimer la classe de bugs « 30 ou 31 jours ».
create function public.period_summary(
  p_group_id uuid,
  p_from date,
  p_to date
)
returns table (income numeric, expense numeric, balance numeric, tx_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(amount) filter (where type = 'income'), 0),
    coalesce(sum(amount) filter (where type = 'expense'), 0),
    coalesce(sum(amount) filter (where type = 'income'), 0)
      - coalesce(sum(amount) filter (where type = 'expense'), 0),
    -- count(*) rend toujours une ligne, jamais NULL, même sur zéro ligne : pas de coalesce ici, contrairement aux sommes. Le cast en integer évite au client un bigint, qui traverse PostgREST en chaîne au-delà de 2^53.
    count(*)::integer
  from public.transactions
  where group_id = p_group_id
    and occurred_on >= p_from
    and occurred_on < p_to;
$$;

revoke all on function public.period_summary(uuid, date, date) from public, anon;
grant execute on function public.period_summary(uuid, date, date) to authenticated;
