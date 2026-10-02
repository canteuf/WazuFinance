-- Suppression d'un budget partagé quitté par son dernier membre (20261002000100_delete_empty_group.sql).
--
-- A prouver : le départ du dernier membre supprime le groupe avec ses opérations, ses portefeuilles et le souvenir de son départ ; un départ qui laisse d'autres membres ne supprime rien ; le compte personnel n'est jamais touché ; la suppression directe d'un groupe par son propriétaire passe toujours.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(9);

-- ---------------------------------------------------------------------------
-- Fixtures, creees en tant que postgres (RLS contournee)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000ea01', 'alice@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-00000000ea02', 'bob@example.com',   '{"display_name": "Bob"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal) values
  ('00000000-0000-0000-0000-00000000eb01', 'Solo', '00000000-0000-0000-0000-00000000ea01', false),
  ('00000000-0000-0000-0000-00000000eb02', 'Duo',  '00000000-0000-0000-0000-00000000ea01', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000eb01', '00000000-0000-0000-0000-00000000ea01', 'owner'),
  ('00000000-0000-0000-0000-00000000eb02', '00000000-0000-0000-0000-00000000ea01', 'owner'),
  ('00000000-0000-0000-0000-00000000eb02', '00000000-0000-0000-0000-00000000ea02', 'member');

insert into public.transactions (id, group_id, user_id, type, amount, occurred_on) values
  ('00000000-0000-0000-0000-00000000ec01', '00000000-0000-0000-0000-00000000eb01',
   '00000000-0000-0000-0000-00000000ea01', 'expense', 2000, '2026-10-01'),
  ('00000000-0000-0000-0000-00000000ec02', '00000000-0000-0000-0000-00000000eb02',
   '00000000-0000-0000-0000-00000000ea02', 'expense', 3000, '2026-10-01');

-- ---------------------------------------------------------------------------
-- Un départ qui laisse d'autres membres
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ea02","role":"authenticated"}', true);

SELECT lives_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-00000000eb02'
       and user_id = '00000000-0000-0000-0000-00000000ea02'$$,
  'Bob quitte Duo, ou Alice reste'
);

set local role postgres;

SELECT is(
  (select count(*)::int from public.transactions where group_id = '00000000-0000-0000-0000-00000000eb02'),
  1,
  'Duo et l''operation de Bob restent : il reste un membre'
);

-- ---------------------------------------------------------------------------
-- Le départ du dernier membre
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ea01","role":"authenticated"}', true);

SELECT lives_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-00000000eb01'
       and user_id = '00000000-0000-0000-0000-00000000ea01'$$,
  'Alice quitte Solo, ou elle etait seule'
);

set local role postgres;

SELECT is(
  (select count(*)::int from public.budget_groups where id = '00000000-0000-0000-0000-00000000eb01'),
  0,
  'Solo est supprime'
);

SELECT is(
  (select count(*)::int from public.transactions where group_id = '00000000-0000-0000-0000-00000000eb01'),
  0,
  'Ses operations partent avec lui'
);

SELECT is(
  (select count(*)::int from public.wallets where group_id = '00000000-0000-0000-0000-00000000eb01'),
  0,
  'Son portefeuille par defaut aussi'
);

SELECT is(
  (select count(*)::int from public.former_members where group_id = '00000000-0000-0000-0000-00000000eb01'),
  0,
  'Aucun souvenir de depart ne reste pour un groupe supprime'
);

SELECT is(
  (select count(*)::int from public.budget_groups
    where owner_id = '00000000-0000-0000-0000-00000000ea01' and is_personal),
  1,
  'Le compte personnel d''Alice reste'
);

-- ---------------------------------------------------------------------------
-- La suppression directe d'un groupe passe toujours
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ea01","role":"authenticated"}', true);

SELECT lives_ok(
  $$delete from public.budget_groups where id = '00000000-0000-0000-0000-00000000eb02'$$,
  'Alice supprime Duo : la cascade des adhesions ne repasse pas par le trigger'
);

SELECT * FROM finish();
ROLLBACK;
