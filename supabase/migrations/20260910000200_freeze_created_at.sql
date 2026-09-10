-- Fige created_at et id sur transactions et budgets, en plus des colonnes
-- deja figees par 20260910000100_activity_log.sql.
--
-- Deux raisons distinctes :
--   - created_at : wasEdited() compare updated_at > created_at cote client
--     pour afficher la mention « modifie ». Le role authenticated a le droit
--     update au niveau table ; sans cette garde, un appel API direct
--     (PATCH .../transactions?id=eq.X {"created_at":"2999-01-01"}) avance
--     created_at au-dela de updated_at et efface la mention, alors que
--     touch_updated_at() a bien horodate le vrai changement.
--   - id : activity_log.subject_id n'a pas de cle etrangere vers la ligne
--     visee (elle peut avoir ete supprimee). Reecrire id rendrait orphelines
--     les entrees deja ecrites pour cette ligne, qui pointeraient vers un
--     identifiant qui n'a jamais existe.
--
-- Recree les deux triggers avec la meme fonction, le meme moment (before
-- update) et le meme niveau (for each row) que 20260910000100_activity_log.sql,
-- seule la liste d'arguments change.

drop trigger transactions_guard_immutable on public.transactions;

create trigger transactions_guard_immutable
  before update on public.transactions
  for each row execute function public.guard_immutable_columns('id', 'user_id', 'group_id', 'created_at');

drop trigger budgets_guard_immutable on public.budgets;

create trigger budgets_guard_immutable
  before update on public.budgets
  for each row execute function public.guard_immutable_columns('id', 'group_id', 'category_id', 'created_at');
