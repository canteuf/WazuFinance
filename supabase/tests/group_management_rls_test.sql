-- RPC create_shared_group, garde anti-orphelin guard_owner_orphan, défaut du
-- code d'invitation (migration group_management). Voir
-- docs/superpowers/specs/2026-09-11-gestion-groupe-design.md.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(15);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'alice-g@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f2', 'bob-g@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f3', 'carol-g@example.com', '{"display_name": "Carol"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f4', 'dora-g@example.com',  '{"display_name": "Dora"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f5', 'eve-g@example.com',   '{"display_name": "Eve"}'::jsonb);

-- Coloc : Alice propriétaire, Bob et Carol membres. Sert au test de la garde
-- anti-orphelin.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000f6', 'Coloc', '00000000-0000-0000-0000-0000000000f1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f1', 'owner'),
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f2', 'member'),
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f3', 'member');

-- Test retrait : Alice propriétaire, Bob et Carol membres. Sert au test de
-- account_memberships_delete_owner_or_self entre deux membres simples.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000f9', 'Test retrait', '00000000-0000-0000-0000-0000000000f1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000f1', 'owner'),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000f2', 'member'),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000f3', 'member');

-- Cascade : Dora propriétaire, Eve membre. Sert au test de suppression de
-- compte en cascade, qui doit passer malgré la garde.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000f7', 'Cascade', '00000000-0000-0000-0000-0000000000f4', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f4', 'owner'),
  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f5', 'member');

-- ---------------------------------------------------------------------------
-- create_shared_group()
-- ---------------------------------------------------------------------------

set local role anon;
SELECT throws_ok(
  $$select public.create_shared_group('Sans session')$$,
  '42501',
  NULL,
  'anon ne peut pas exécuter create_shared_group'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

create temporary table g_new_group as
select public.create_shared_group('Vacances entre amis') as id;

SELECT is(
  (select owner_id from public.budget_groups where id = (select id from g_new_group)),
  '00000000-0000-0000-0000-0000000000f1'::uuid,
  'create_shared_group crée un groupe dont Alice est propriétaire'
);

SELECT is(
  (select role::text from public.account_memberships
    where group_id = (select id from g_new_group)
      and user_id = '00000000-0000-0000-0000-0000000000f1'),
  'owner',
  'create_shared_group crée la ligne d''adhésion owner'
);

-- ---------------------------------------------------------------------------
-- guard_owner_orphan : Alice, propriétaire de Coloc, ne peut pas partir tant
-- que Bob et Carol y sont.
-- ---------------------------------------------------------------------------

SELECT throws_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000000f6'
       and user_id = '00000000-0000-0000-0000-0000000000f1'$$,
  'P0001',
  'Le propriétaire ne peut pas quitter un groupe qui a d''autres membres',
  'Alice ne peut pas quitter Coloc tant que Bob et Carol y sont'
);

SELECT lives_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000000f6'
       and user_id = '00000000-0000-0000-0000-0000000000f2'$$,
  'Alice exclut Bob de Coloc'
);

SELECT lives_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000000f6'
       and user_id = '00000000-0000-0000-0000-0000000000f3'$$,
  'Alice exclut Carol de Coloc'
);

-- Alice est maintenant seule dans Coloc : la garde ne s'applique plus.
SELECT lives_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000000f6'
       and user_id = '00000000-0000-0000-0000-0000000000f1'$$,
  'Alice peut quitter Coloc une fois seule membre restante'
);

-- ---------------------------------------------------------------------------
-- account_memberships_delete_owner_or_self : un membre simple ne peut retirer
-- que lui-même, jamais un autre membre.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);

-- Un DELETE que la policy ne laisse pas voir ne lève pas d'erreur : il ne
-- touche simplement aucune ligne, même motif que savings_goals_rls_test.sql.
SELECT lives_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000000f9'
       and user_id = '00000000-0000-0000-0000-0000000000f3'$$,
  'Bob ne supprime aucune ligne en tentant de retirer Carol, sans erreur'
);

SELECT is(
  (select count(*)::int from public.account_memberships
    where group_id = '00000000-0000-0000-0000-0000000000f9'
      and user_id = '00000000-0000-0000-0000-0000000000f3'),
  1,
  'Carol est toujours membre de Test retrait'
);

SELECT lives_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000000f9'
       and user_id = '00000000-0000-0000-0000-0000000000f2'$$,
  'Bob se retire lui-même de Test retrait'
);

-- ---------------------------------------------------------------------------
-- Défaut du code d'invitation, et group_invitations_insert_owner
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

WITH inv AS (
  insert into public.group_invitations (group_id, created_by, expires_at)
  values ('00000000-0000-0000-0000-0000000000f9',
          '00000000-0000-0000-0000-0000000000f1', now() + interval '7 days')
  returning code
)
SELECT ok(
  (select code ~ '^[0-9a-f]{8}$' from inv),
  'Le code d''invitation généré par défaut est 8 caractères hexadécimaux'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);

SELECT throws_ok(
  $$insert into public.group_invitations (group_id, created_by, expires_at)
    values ('00000000-0000-0000-0000-0000000000f9',
            '00000000-0000-0000-0000-0000000000f3', now() + interval '7 days')$$,
  '42501',
  NULL,
  'Carol, simple membre, ne peut pas créer d''invitation'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

SELECT throws_ok(
  $$insert into public.group_invitations (group_id, created_by, expires_at)
    values ('00000000-0000-0000-0000-0000000000f9',
            '00000000-0000-0000-0000-0000000000f1', now() - interval '1 day')$$,
  '42501',
  NULL,
  'Une invitation avec une échéance passée est refusée'
);

-- ---------------------------------------------------------------------------
-- La garde ne bloque pas une cascade : suppression du compte de Dora,
-- propriétaire de Cascade, alors qu'Eve y est encore membre.
-- ---------------------------------------------------------------------------

set local role postgres;

SELECT lives_ok(
  $$delete from auth.users where id = '00000000-0000-0000-0000-0000000000f4'$$,
  'La suppression du compte de Dora réussit malgré Eve, encore membre'
);

SELECT is(
  (select count(*)::int from public.account_memberships
    where group_id = '00000000-0000-0000-0000-0000000000f7'),
  0,
  'La cascade a bien retiré Dora et Eve de Cascade'
);

SELECT * FROM finish();
ROLLBACK;
