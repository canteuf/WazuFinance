-- Couverture du provisionnement à l'inscription.
--
-- handle_new_user() s'exécute dans la transaction d'inscription de Supabase
-- Auth. S'il échoue, le client ne reçoit qu'un opaque « Database error saving
-- new user » : aucune indication de la cause. D'où ces tests, qui exercent le
-- trigger directement en insérant dans auth.users.
--
-- Y figure aussi guard_personal_group_membership(), qui protège le même
-- invariant — un compte personnel reste à un seul membre — et dont le cas
-- limite (ne pas bloquer la suppression en cascade) n'est pas évident.
--
--   npx supabase test db
--
-- Tout est enveloppé dans une transaction annulée en fin de fichier : la base
-- locale n'est pas modifiée.

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(18);

-- ---------------------------------------------------------------------------
-- Fixtures : deux inscriptions, l'une avec display_name, l'autre sans.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-0000000000a1',
  'camille@example.com',
  '{"display_name": "Camille Durand"}'::jsonb
);

-- raw_user_meta_data vide : le trigger doit retomber sur la partie locale de
-- l'email. Un display_name fait uniquement d'espaces suit le même chemin.
insert into auth.users (id, email, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-0000000000a2',
  'lea@example.com',
  '{"display_name": "   "}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Profil
-- ---------------------------------------------------------------------------

SELECT is(
  (select count(*)::int from public.users where id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'Le profil public.users est créé à l''inscription'
);

SELECT is(
  (select display_name from public.users where id = '00000000-0000-0000-0000-0000000000a1'),
  'Camille Durand',
  'display_name est repris depuis raw_user_meta_data'
);

SELECT is(
  (select display_name from public.users where id = '00000000-0000-0000-0000-0000000000a2'),
  'lea',
  'display_name vide retombe sur la partie locale de l''email'
);

SELECT is(
  (select email from public.users where id = '00000000-0000-0000-0000-0000000000a1'),
  'camille@example.com',
  'L''email est recopié depuis auth.users'
);

-- ---------------------------------------------------------------------------
-- Groupe personnel
-- ---------------------------------------------------------------------------

SELECT is(
  (select count(*)::int
     from public.budget_groups
    where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'Exactement un groupe est créé à l''inscription'
);

SELECT ok(
  (select is_personal
     from public.budget_groups
    where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  'Ce groupe est marqué is_personal'
);

SELECT is(
  (select name
     from public.budget_groups
    where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  'Compte personnel',
  'Le groupe personnel porte le nom attendu'
);

-- ---------------------------------------------------------------------------
-- Adhésion
-- ---------------------------------------------------------------------------

SELECT is(
  (select m.role::text
     from public.account_memberships m
     join public.budget_groups g on g.id = m.group_id
    where g.owner_id = '00000000-0000-0000-0000-0000000000a1'),
  'owner',
  'L''utilisateur est owner de son groupe personnel'
);

SELECT is(
  (select count(*)::int
     from public.account_memberships m
     join public.budget_groups g on g.id = m.group_id
    where g.owner_id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'Le groupe personnel compte un seul membre'
);

-- Le cœur du modèle : aucun utilisateur ne peut exister sans groupe, donc
-- l'app n'a jamais à gérer cet état.
SELECT is(
  (select count(*)::int
     from public.users u
    where not exists (
      select 1 from public.account_memberships m where m.user_id = u.id
    )),
  0,
  'Aucun utilisateur sans adhésion'
);

-- ---------------------------------------------------------------------------
-- Invariant : un compte personnel reste à un seul membre
-- ---------------------------------------------------------------------------

SELECT throws_ok(
  format(
    'insert into public.account_memberships (group_id, user_id) values (%L, %L)',
    (select id from public.budget_groups
      where owner_id = '00000000-0000-0000-0000-0000000000a1'),
    '00000000-0000-0000-0000-0000000000a2'
  ),
  'P0001',
  'Un compte personnel ne peut avoir qu''un seul membre',
  'Un second membre est refusé dans un compte personnel'
);

SELECT throws_ok(
  format(
    'delete from public.account_memberships where group_id = %L',
    (select id from public.budget_groups
      where owner_id = '00000000-0000-0000-0000-0000000000a1')
  ),
  'P0001',
  'Impossible de quitter son compte personnel',
  'On ne peut pas quitter son compte personnel'
);

SELECT throws_ok(
  format(
    'insert into public.budget_groups (name, owner_id, is_personal) values (%L, %L, true)',
    'Second perso',
    '00000000-0000-0000-0000-0000000000a1'
  ),
  '23505',
  NULL,
  'Un utilisateur ne peut avoir deux groupes personnels'
);

-- Un groupe partagé, lui, accepte plusieurs membres : le guard ne doit pas
-- déborder sur le cas normal.
insert into public.budget_groups (id, name, owner_id, is_personal)
values (
  '00000000-0000-0000-0000-0000000000b1',
  'Colocation',
  '00000000-0000-0000-0000-0000000000a1',
  false
);

SELECT lives_ok(
  $$insert into public.account_memberships (group_id, user_id, role)
    values ('00000000-0000-0000-0000-0000000000b1',
            '00000000-0000-0000-0000-0000000000a2', 'member')$$,
  'Un groupe partagé accepte un second membre'
);

-- ---------------------------------------------------------------------------
-- Suppression en cascade
--
-- Cas limite : le guard sur DELETE doit laisser passer la cascade. La ligne
-- parente de budget_groups est déjà supprimée quand le trigger s'exécute, donc
-- is_personal vaut NULL et la condition ne se déclenche pas. Sans cela, aucun
-- compte ne pourrait jamais être supprimé.
-- ---------------------------------------------------------------------------

delete from auth.users where id = '00000000-0000-0000-0000-0000000000a2';

SELECT is(
  (select count(*)::int from public.users where id = '00000000-0000-0000-0000-0000000000a2'),
  0,
  'Supprimer le compte auth supprime le profil'
);

SELECT is(
  (select count(*)::int from public.budget_groups where owner_id = '00000000-0000-0000-0000-0000000000a2'),
  0,
  'Supprimer le compte auth supprime son groupe personnel'
);

-- ---------------------------------------------------------------------------
-- Indépendance vis-à-vis de l'ordre des cascades
--
-- Le test précédent passe parce que budget_groups_owner_id_fkey précède
-- account_memberships_user_id_fkey : les groupes cascadent en premier, et le
-- guard voit une ligne parente déjà supprimée. Cet ordre n'est qu'une
-- conséquence de l'ordre de création des tables.
--
-- On le renverse ici — recréer la contrainte lui donne un OID plus élevé, donc
-- elle s'exécute en dernier — pour reproduire le scénario où les adhésions
-- cascadent avant les groupes. C'est exactement le cas qui cassait la
-- suppression de compte avant la migration 20260904000400.
-- ---------------------------------------------------------------------------

alter table public.budget_groups drop constraint budget_groups_owner_id_fkey;

alter table public.budget_groups
  add constraint budget_groups_owner_id_fkey
  foreign key (owner_id) references public.users (id) on delete cascade;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-0000000000a3',
  'noe@example.com',
  '{}'::jsonb
);

SELECT lives_ok(
  $$delete from auth.users where id = '00000000-0000-0000-0000-0000000000a3'$$,
  'La suppression de compte tient quel que soit l''ordre des cascades'
);

SELECT is(
  (select count(*)::int
     from public.account_memberships
    where user_id = '00000000-0000-0000-0000-0000000000a3'),
  0,
  'Aucune adhésion orpheline après suppression du compte'
);

SELECT * FROM finish();
ROLLBACK;
