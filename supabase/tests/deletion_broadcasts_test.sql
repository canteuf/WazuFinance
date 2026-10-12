-- Annonce des suppressions sur des canaux privés (20261012000200_deletion_broadcasts.sql).
--
-- À prouver : une suppression écrit un message sur le sujet du groupe (ou de l'utilisateur), un seul par groupe même pour une suppression de plusieurs lignes, et seuls les membres peuvent le lire.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000bb01', 'alice-b@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-00000000bb02', 'bob-b@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-00000000bb03', 'carol-b@example.com', '{"display_name": "Carol"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal) values
  ('00000000-0000-0000-0000-00000000bc01', 'Duo', '00000000-0000-0000-0000-00000000bb01', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000bc01', '00000000-0000-0000-0000-00000000bb01', 'owner'),
  ('00000000-0000-0000-0000-00000000bc01', '00000000-0000-0000-0000-00000000bb02', 'member');

insert into public.transactions (group_id, user_id, type, amount)
select '00000000-0000-0000-0000-00000000bc01', '00000000-0000-0000-0000-00000000bb01', 'expense', 1000
from generate_series(1, 3);

insert into public.savings_goals (id, user_id, name, target_amount) values
  ('00000000-0000-0000-0000-00000000bd01', '00000000-0000-0000-0000-00000000bb01', 'Moto', 500000);

-- ---------------------------------------------------------------------------
-- Émission
-- ---------------------------------------------------------------------------

delete from public.transactions where group_id = '00000000-0000-0000-0000-00000000bc01';

SELECT is(
  (select count(*)::int from realtime.messages
    where topic = 'group:00000000-0000-0000-0000-00000000bc01' and event = 'deleted' and private),
  1,
  'trois opérations supprimées d''un coup : un seul message, privé, sur le sujet du groupe'
);

SELECT is(
  (select payload ->> 'table' from realtime.messages
    where topic = 'group:00000000-0000-0000-0000-00000000bc01' and event = 'deleted' limit 1),
  'transactions',
  'le message ne porte que le nom de la table'
);

delete from public.savings_goals where id = '00000000-0000-0000-0000-00000000bd01';

SELECT is(
  (select count(*)::int from realtime.messages
    where topic = 'user:00000000-0000-0000-0000-00000000bb01' and payload ->> 'table' = 'savings_goals'),
  1,
  'un objectif d''épargne supprimé est annoncé sur le sujet de son propriétaire, jamais sur celui d''un groupe'
);

delete from public.account_memberships
 where group_id = '00000000-0000-0000-0000-00000000bc01' and user_id = '00000000-0000-0000-0000-00000000bb02';

SELECT is(
  (select count(*)::int from realtime.messages
    where topic = 'user:00000000-0000-0000-0000-00000000bb02' and payload ->> 'table' = 'account_memberships'),
  1,
  'la personne exclue est prévenue sur son propre sujet'
);

-- ---------------------------------------------------------------------------
-- Lecture : qui peut écouter quel sujet
-- ---------------------------------------------------------------------------

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000bb01","role":"authenticated"}', true);
select set_config('realtime.topic', 'group:00000000-0000-0000-0000-00000000bc01', true);

SELECT ok(
  (select count(*) from realtime.messages where extension = 'broadcast') > 0,
  'un membre lit les messages du sujet de son groupe'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000bb03","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from realtime.messages where extension = 'broadcast'),
  0,
  'une étrangère ne lit rien sur le sujet d''un groupe dont elle n''est pas membre'
);

select set_config('realtime.topic', 'user:00000000-0000-0000-0000-00000000bb01', true);

SELECT is(
  (select count(*)::int from realtime.messages where extension = 'broadcast'),
  0,
  'ni sur le sujet personnel de quelqu''un d''autre'
);

SELECT * FROM finish();
ROLLBACK;
