-- Journal d'activité, updated_at fiable et colonnes figées.
--
-- Spec : docs/superpowers/specs/2026-09-10-journal-activite-design.md. Les
-- mentions « spec n » renvoient à la liste de tests de la spec.
--
-- Deux membres d'un groupe partagé, Alice (propriétaire) et Bob, et une
-- étrangère, Carole. Alice possède le groupe : si c'était Bob, supprimer son
-- compte emporterait le groupe entier (budget_groups.owner_id est en cascade)
-- et les tests de suppression de compte ne prouveraient rien.
--
-- now() est figé pour toute la transaction du test. Les fixtures datent donc
-- created_at et updated_at d'un instant passé explicite : sans cela, « updated_at
-- a bougé » et « updated_at n'a pas bougé » seraient indiscernables.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'alice@example.com',  '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f2', 'bob@example.com',    '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f3', 'carole@example.com', '{"display_name": "Carole"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal) values
  ('00000000-0000-0000-0000-0000000000f4', 'Colocation',
   '00000000-0000-0000-0000-0000000000f1', false),
  ('00000000-0000-0000-0000-0000000000f5', 'Vacances',
   '00000000-0000-0000-0000-0000000000f1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f1', 'owner'),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2', 'member'),
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f1', 'owner');

insert into public.transactions
  (id, group_id, user_id, category_id, type, amount, occurred_on, note, created_at, updated_at)
values
  -- Saisie par Alice, modifiée par Bob plus bas.
  ('00000000-0000-0000-0000-0000000000fa',
   '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 15.00, '2026-09-08', 'Carrefour',
   '2026-09-01 10:00+00', '2026-09-01 10:00+00'),
  -- Saisie par Bob : disparaît avec son compte.
  ('00000000-0000-0000-0000-0000000000fb',
   '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2',
   (select id from public.categories where group_id is null and name = 'Restaurants'),
   'expense', 42.00, '2026-09-08', null,
   '2026-09-01 10:00+00', '2026-09-01 10:00+00'),
  -- Saisie par Alice, supprimée par Bob plus bas.
  ('00000000-0000-0000-0000-0000000000fc',
   '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Transport'),
   'expense', 20.00, '2026-09-08', null,
   '2026-09-01 10:00+00', '2026-09-01 10:00+00'),
  -- Dans le groupe Vacances, supprimé en entier plus bas.
  ('00000000-0000-0000-0000-0000000000f6',
   '00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Loisirs'),
   'expense', 80.00, '2026-09-08', null,
   '2026-09-01 10:00+00', '2026-09-01 10:00+00');

insert into public.budgets (id, group_id, category_id, period, amount, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000fd', '00000000-0000-0000-0000-0000000000f4',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'monthly', 300.00, '2026-09-01 10:00+00', '2026-09-01 10:00+00'),
  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f5',
   (select id from public.categories where group_id is null and name = 'Loisirs'),
   'monthly', 200.00, '2026-09-01 10:00+00', '2026-09-01 10:00+00');

-- ---------------------------------------------------------------------------
-- Bob, membre du groupe partagé
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);

-- spec 3 : ce que fait l'app quand on enregistre un formulaire sans rien changer.
update public.transactions set amount = amount
 where id = '00000000-0000-0000-0000-0000000000fa';

SELECT is(
  (select updated_at from public.transactions where id = '00000000-0000-0000-0000-0000000000fa'),
  '2026-09-01 10:00+00'::timestamptz,
  'Une mise a jour sans changement laisse updated_at intact'
);

-- spec 4 : sans cette règle, une seconde mise à jour réglant updated_at sur
-- created_at effacerait la mention « modifié » après coup.
update public.transactions set updated_at = '2000-01-01 00:00+00'
 where id = '00000000-0000-0000-0000-0000000000fa';

SELECT is(
  (select updated_at from public.transactions where id = '00000000-0000-0000-0000-0000000000fa'),
  '2026-09-01 10:00+00'::timestamptz,
  'Une valeur de updated_at envoyee par le client est ignoree'
);

-- Le pendant : un vrai changement date updated_at de l'instant, même si le
-- client envoie une autre valeur dans la même requête.
update public.transactions set note = 'Train', updated_at = '2000-01-01 00:00+00'
 where id = '00000000-0000-0000-0000-0000000000fc';

SELECT is(
  (select updated_at from public.transactions where id = '00000000-0000-0000-0000-0000000000fc'),
  now(),
  'Un vrai changement date updated_at de l''instant, pas de la valeur envoyee'
);

-- spec 10, 11, 12. Le message est vérifié en plus du code : 42501 est aussi
-- le code d'un refus RLS, et seul le message prouve que c'est le trigger qui
-- a refusé.
SELECT throws_ok(
  $$update public.transactions set user_id = '00000000-0000-0000-0000-0000000000f1'
     where id = '00000000-0000-0000-0000-0000000000fb'$$,
  '42501',
  'Colonne user_id non modifiable',
  'Changer l''auteur d''une operation est refuse'
);

-- Vers le groupe personnel de Bob, dont il est membre : la policy laisserait
-- passer, seul le trigger peut refuser.
SELECT throws_ok(
  $$update public.transactions
       set group_id = (select id from public.budget_groups
                        where owner_id = '00000000-0000-0000-0000-0000000000f2' and is_personal)
     where id = '00000000-0000-0000-0000-0000000000fb'$$,
  '42501',
  'Colonne group_id non modifiable',
  'Deplacer une operation vers un autre groupe est refuse'
);

SELECT throws_ok(
  $$update public.budgets
       set category_id = (select id from public.categories where group_id is null and name = 'Transport')
     where id = '00000000-0000-0000-0000-0000000000fd'$$,
  '42501',
  'Colonne category_id non modifiable',
  'Changer la categorie d''un budget est refuse'
);

SELECT * FROM finish();
ROLLBACK;
