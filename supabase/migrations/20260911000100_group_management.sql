-- Écran 7 (gestion du groupe) : créer un groupe partagé sans policy
-- impossible à satisfaire, générer un code d'invitation en base, empêcher un
-- propriétaire de laisser un groupe orphelin de propriétaire.
--
-- Voir docs/superpowers/specs/2026-09-11-gestion-groupe-design.md.

-- ---------------------------------------------------------------------------
-- create_shared_group : contourne le problème d'œuf et de poule.
--
-- account_memberships_insert_owner exige is_group_owner(group_id), qui ne
-- peut jamais être vrai pour la toute première ligne d'un groupe (aucune
-- ligne owner n'existe encore). budget_groups_insert_shared suffit à créer
-- le groupe, mais pas la ligne d'adhésion qui suit.
-- ---------------------------------------------------------------------------

create function public.create_shared_group(name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  insert into public.budget_groups (name, owner_id, is_personal)
  values (name, auth.uid(), false)
  returning id into new_group_id;

  insert into public.account_memberships (group_id, user_id, role)
  values (new_group_id, auth.uid(), 'owner');

  return new_group_id;
end;
$$;

revoke all on function public.create_shared_group(text) from public, anon;
grant execute on function public.create_shared_group(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Code d'invitation généré en base : le client ne doit jamais en inventer un.
-- ---------------------------------------------------------------------------

-- gen_random_bytes vit dans le schéma extensions sur Supabase hébergé (pas
-- public) : pgcrypto y est déjà provisionné par la plateforme, et le rôle qui
-- applique les migrations n'a pas ce schéma dans son search_path — d'où la
-- qualification explicite. gen_random_uuid(), utilisé ailleurs dans le schéma
-- (20260904000100_schema.sql) sans qualification, n'a pas ce problème : c'est
-- une fonction native de Postgres depuis la version 13, indépendante de
-- pgcrypto et donc toujours résolue sans qualification.
alter table public.group_invitations
  alter column code set default encode(extensions.gen_random_bytes(4), 'hex');

-- ---------------------------------------------------------------------------
-- guard_owner_orphan : bloque le départ ou la rétrogradation volontaire d'un
-- propriétaire tant que le groupe compte d'autres membres.
--
-- pg_trigger_depth() = 1 restreint la garde à l'action directe. Ce trigger
-- s'exécute déjà à la profondeur 1 pour un DELETE ou UPDATE direct sur
-- account_memberships (vérifié : pg_trigger_depth() ne redescend jamais à 0
-- pendant l'exécution du trigger lui-même, il vaut 1 dès le déclenchement
-- direct). Toute cascade (suppression du groupe par son propriétaire, ou
-- suppression de compte) s'exécute imbriquée dans le trigger système de la
-- contrainte de clé étrangère, donc à une profondeur supérieure à 1, et
-- n'est pas concernée. Fermer cette échappatoire côté suppression de compte
-- est hors périmètre ici (écran 8, pas encore conçu) : voir la spec.
-- ---------------------------------------------------------------------------

create function public.guard_owner_orphan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  becomes_non_owner boolean;
begin
  becomes_non_owner := (tg_op = 'DELETE') or (new.role <> 'owner');

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

create trigger account_memberships_guard_owner_orphan
  before update or delete on public.account_memberships
  for each row execute function public.guard_owner_orphan();
