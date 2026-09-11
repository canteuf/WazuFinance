-- Corrige guard_owner_orphan() : la version d'origine
-- (20260911000100_group_management.sql) calculait becomes_non_owner avec
--   becomes_non_owner := (tg_op = 'DELETE') or (new.role <> 'owner');
-- ce qui évite l'erreur « record "new" is not assigned yet » sur un DELETE
-- uniquement parce que Postgres évalue OR de gauche à droite et court-circuite
-- dès le premier TRUE — une dépendance implicite à l'ordre d'évaluation dans
-- une garde de sécurité, plutôt qu'une dépendance explicite. Remplacée par un
-- if explicite, sans changement de comportement.

create or replace function public.guard_owner_orphan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  becomes_non_owner boolean;
begin
  if tg_op = 'DELETE' then
    becomes_non_owner := true;
  else
    becomes_non_owner := new.role <> 'owner';
  end if;

  -- SECURITY DEFINER pour que ce garde-fou reste fiable même si RLS venait un
  -- jour à masquer les lignes sœurs à l'appelant — sous SECURITY INVOKER, cet
  -- exists(...) échouerait ouvert (silencieusement faux) au lieu de bloquer.
  if pg_trigger_depth() = 1 and old.role = 'owner' and becomes_non_owner then
    if exists (
      select 1 from public.account_memberships
       where group_id = old.group_id and user_id <> old.user_id
    ) then
      raise exception 'Le propriétaire ne peut pas quitter un groupe qui a d''autres membres';
    end if;
  end if;

  -- BEFORE UPDATE doit renvoyer new : renvoyer old annulerait silencieusement
  -- toute modification autorisée en réécrivant les anciennes valeurs. old ne
  -- convient que pour delete, qui n'a pas de new.
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
