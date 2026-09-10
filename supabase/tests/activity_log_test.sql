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
SELECT plan(28);

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

-- spec 2 : les deux mises à jour ci-dessus ne changent rien d'autre que
-- updated_at, et n'écrivent donc rien.
SELECT is(
  (select count(*)::int from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fa'),
  0,
  'Une mise a jour sans changement reel n''ecrit aucune entree'
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

-- spec 1 : Bob modifie une opération saisie par Alice.
update public.transactions set amount = 150.00
 where id = '00000000-0000-0000-0000-0000000000fa';

SELECT is(
  (select actor_id from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fa'),
  '00000000-0000-0000-0000-0000000000f2'::uuid,
  'L''entree designe Bob, auteur de la modification, pas Alice, auteur de la saisie'
);

SELECT is(
  (select actor_name from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fa'),
  'Bob',
  'L''entree garde le nom de l''auteur au moment de l''action'
);

SELECT is(
  (select changed_fields from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fa'),
  array['amount']::text[],
  'changed_fields ne liste que la colonne modifiee, sans updated_at'
);

SELECT is(
  (select (old_values ->> 'amount')::numeric from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fa'),
  15.00::numeric,
  'old_values porte le montant d''avant'
);

SELECT is(
  (select (new_values ->> 'amount')::numeric from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fa'),
  150.00::numeric,
  'new_values porte le montant d''apres'
);

-- spec 5 : Bob supprime une opération saisie par Alice.
delete from public.transactions where id = '00000000-0000-0000-0000-0000000000fc';

SELECT is(
  (select count(*)::int from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fc' and action = 'delete'),
  1,
  'Une suppression ecrit une entree delete'
);

SELECT is(
  (select (old_values ->> 'amount')::numeric from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fc' and action = 'delete'),
  20.00::numeric,
  'L''entree de suppression garde la ligne disparue'
);

SELECT ok(
  (select new_values is null and changed_fields = '{}'::text[] from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fc' and action = 'delete'),
  'Une suppression n''a ni new_values ni changed_fields'
);

-- spec 6
update public.budgets set amount = 350.00
 where id = '00000000-0000-0000-0000-0000000000fd';

SELECT is(
  (select count(*)::int from public.activity_log
    where subject = 'budget'
      and subject_id = '00000000-0000-0000-0000-0000000000fd'
      and action = 'update'
      and changed_fields = array['amount']::text[]),
  1,
  'La modification d''un plafond est journalisee'
);

-- ---------------------------------------------------------------------------
-- Alice, membre : lit le journal, ne peut pas y écrire (spec 8, 9)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

SELECT throws_ok(
  $$insert into public.activity_log (group_id, subject, subject_id, action, old_values, changed_fields)
    values ('00000000-0000-0000-0000-0000000000f4', 'transaction',
            '00000000-0000-0000-0000-0000000000fa', 'delete', '{}'::jsonb, '{}')$$,
  '42501',
  NULL,
  'Un membre ne peut pas ecrire dans le journal'
);

-- Les droits sont retirés en plus de l'absence de policy : ces deux requêtes
-- lèvent une erreur au lieu de ne toucher aucune ligne. La relecture en
-- postgres plus bas prouve, elle, que rien n'a changé.
SELECT throws_ok(
  $$update public.activity_log set actor_name = 'Alice'$$,
  '42501',
  NULL,
  'Un membre ne peut pas reecrire une entree'
);

SELECT throws_ok(
  $$delete from public.activity_log$$,
  '42501',
  NULL,
  'Un membre ne peut pas effacer une entree'
);

-- ---------------------------------------------------------------------------
-- Carole, étrangère au groupe (spec 7)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.activity_log
    where group_id = '00000000-0000-0000-0000-0000000000f4'),
  0,
  'Un non-membre ne lit aucune entree du groupe'
);

-- ---------------------------------------------------------------------------
-- Retour en postgres pour constater l'état réel, hors RLS
-- ---------------------------------------------------------------------------

set local role postgres;

-- Quatre entrées : la note de …fc, le montant de …fa, la suppression de …fc,
-- le plafond de …fd.
SELECT is(
  (select count(*)::int from public.activity_log
    where group_id = '00000000-0000-0000-0000-0000000000f4'),
  4,
  'Les quatre entrees du groupe sont intactes'
);

SELECT is(
  (select actor_name from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fa'),
  'Bob',
  'Aucune entree n''a ete reecrite par Alice'
);

-- spec 13 : supprimer un groupe supprime ses opérations et ses budgets en
-- cascade. Sans le garde de log_activity(), le trigger voudrait journaliser
-- ces suppressions dans un groupe déjà effacé, la clé étrangère lèverait une
-- erreur, et toute la suppression du groupe serait annulée.
SELECT lives_ok(
  $$delete from public.budget_groups where id = '00000000-0000-0000-0000-0000000000f5'$$,
  'Supprimer un groupe qui contient des operations et des budgets reussit'
);

SELECT is(
  (select count(*)::int from public.activity_log
    where group_id = '00000000-0000-0000-0000-0000000000f5'),
  0,
  'Un groupe supprime ne laisse aucune entree'
);

-- spec 14, 15 : Bob supprime son propre compte — la session est la sienne.
-- Ses opérations dans le groupe partagé partent en cascade et sont
-- journalisées ; son profil users est déjà effacé à ce moment-là. Si
-- log_activity() prenait auth.uid() tel quel, il insérerait un actor_id qui
-- ne pointe plus vers rien, la clé étrangère lèverait une erreur et la
-- suppression du compte serait annulée.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);

SELECT lives_ok(
  $$delete from auth.users where id = '00000000-0000-0000-0000-0000000000f2'$$,
  'Bob peut supprimer son compte : l''auteur est lu dans users, pas pris a auth.uid()'
);

SELECT is(
  (select count(*)::int from public.activity_log
    where group_id = '00000000-0000-0000-0000-0000000000f4'
      and actor_name = 'Bob'
      and actor_id is null),
  4,
  'Les entrees de Bob survivent a son compte, a son nom, sans actor_id'
);

SELECT is(
  (select count(*)::int from public.activity_log
    where group_id = '00000000-0000-0000-0000-0000000000f4'
      and actor_id is not null),
  0,
  'Aucune entree ne pointe plus vers le compte supprime'
);

SELECT is(
  (select count(*)::int from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fb'
      and action = 'delete'
      and actor_id is null
      and actor_name is null),
  1,
  'La suppression en cascade de l''operation de Bob est journalisee, sans auteur'
);

SELECT * FROM finish();
ROLLBACK;
