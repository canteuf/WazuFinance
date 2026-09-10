-- Wazu Finance — journal d'activité (traçabilité niveau 3)
--
-- Dans un budget partagé, tout membre peut modifier ou supprimer n'importe
-- quelle ligne du groupe. Cette migration garde la trace de qui a changé quoi,
-- de la valeur d'avant, et de qui a supprimé une ligne qui n'existe plus.
--
-- Spec : docs/superpowers/specs/2026-09-10-journal-activite-design.md
--
-- Ordre : (1) updated_at fiable, (2) colonnes figées, (3) remise à zéro de
-- updated_at, (4) journal. La remise à zéro précède les triggers de journal.

-- ---------------------------------------------------------------------------
-- 1. updated_at ne bouge que sur un changement réel
-- ---------------------------------------------------------------------------

-- Remplace la version du schéma initial, qui écrivait now() à chaque UPDATE :
-- un enregistrement sans changement marquait la ligne comme modifiée. La
-- comparaison ignore updated_at, avec la même expression que log_activity(),
-- pour que la mention « modifié » et le journal soient toujours d'accord.
--
-- La valeur envoyée par le client est ignorée dans les deux branches : sans
-- cela, une seconde mise à jour réglant updated_at sur created_at effacerait
-- la mention après coup.
--
-- Partagée par transactions, budgets et savings_goals.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Colonnes figées
-- ---------------------------------------------------------------------------

-- L'app ne modifie jamais ces colonnes ; la policy de modification, elle, les
-- laissait libres, et un appel direct à l'API pouvait réattribuer une dépense
-- ou la déplacer de groupe. Les figer rend « créé par » digne de foi et garde
-- chaque entrée du journal dans un seul groupe.
--
-- Générique : les colonnes arrivent en arguments du trigger. 42501 est déjà
-- traduit par src/lib/data-errors.ts.
create or replace function public.guard_immutable_columns()
returns trigger
language plpgsql
as $$
declare
  col text;
begin
  foreach col in array tg_argv loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      raise exception 'Colonne % non modifiable', col
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create trigger transactions_guard_immutable
  before update on public.transactions
  for each row execute function public.guard_immutable_columns('user_id', 'group_id');

-- category_id aussi : l'interface verrouille déjà la catégorie en édition, la
-- base s'aligne dessus.
create trigger budgets_guard_immutable
  before update on public.budgets
  for each row execute function public.guard_immutable_columns('group_id', 'category_id');

-- ---------------------------------------------------------------------------
-- 3. Remise à zéro de updated_at — écrit sur les données existantes
-- ---------------------------------------------------------------------------

-- Les dates de modification actuelles ne valent rien : un enregistrement sans
-- changement les faisait bouger. Sans remise à zéro, des lignes jamais
-- réellement modifiées afficheraient « modifié » à vie. Le journal comme la
-- mention commencent donc au jour de cette migration. Irréversible.
--
-- Les triggers updated_at sont coupés le temps de l'opération, et ce n'est pas
-- une précaution de confort : l'ancienne version réécrirait now() sur chaque
-- ligne, la nouvelle — qui ignore la valeur envoyée — rétablirait
-- old.updated_at. Dans les deux cas la remise à zéro n'aurait aucun effet.
alter table public.transactions disable trigger transactions_touch_updated_at;
alter table public.budgets disable trigger budgets_touch_updated_at;

update public.transactions set updated_at = created_at where updated_at <> created_at;
update public.budgets set updated_at = created_at where updated_at <> created_at;

alter table public.transactions enable trigger transactions_touch_updated_at;
alter table public.budgets enable trigger budgets_touch_updated_at;
