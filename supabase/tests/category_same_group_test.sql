-- Catégorie du même groupe (20261002000200_category_same_group.sql).
--
-- A prouver : une opération, un budget ou un modèle récurrent refuse une catégorie personnalisée d'un autre groupe, même posée par un membre des deux, et accepte une catégorie du groupe ou par défaut ; une ligne déjà enregistrée ainsi reste modifiable sur ses autres champs ; supprimer la catégorie avec report ne reporte que les lignes de son groupe, si bien qu'un lecteur de l'autre groupe ne peut plus y ranger les opérations dans une catégorie de son choix.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(11);

-- ---------------------------------------------------------------------------
-- Fixtures, creees en tant que postgres (RLS contournee)
-- ---------------------------------------------------------------------------

-- Alice est membre des deux groupes. Carol écrit dans A et ne fait que lire B.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000fa01', 'alice@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-00000000fa02', 'bob@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-00000000fa03', 'carol@example.com', '{"display_name": "Carol"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal) values
  ('00000000-0000-0000-0000-00000000fb01', 'A', '00000000-0000-0000-0000-00000000fa01', false),
  ('00000000-0000-0000-0000-00000000fb02', 'B', '00000000-0000-0000-0000-00000000fa02', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa01', 'owner'),
  ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa03', 'member'),
  ('00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000fa02', 'owner'),
  ('00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000fa01', 'member'),
  ('00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000fa03', 'viewer');

insert into public.categories (id, group_id, name, icon, type) values
  ('00000000-0000-0000-0000-00000000fc01', '00000000-0000-0000-0000-00000000fb01', 'Animaux', 'paw', 'expense'),
  ('00000000-0000-0000-0000-00000000fc02', '00000000-0000-0000-0000-00000000fb01', 'Sport', 'dumbbell', 'expense'),
  ('00000000-0000-0000-0000-00000000fc03', '00000000-0000-0000-0000-00000000fb02', 'Jeux', 'gamepad-variant-outline', 'expense');

insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on) values
  ('00000000-0000-0000-0000-00000000fd01', '00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000fa02',
   '00000000-0000-0000-0000-00000000fc03', 'expense', 1000, '2026-10-01'),
  ('00000000-0000-0000-0000-00000000fd02', '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa01',
   '00000000-0000-0000-0000-00000000fc01', 'expense', 2000, '2026-10-01');

-- Une opération de B rangée dans une catégorie de A avant ce contrôle : le trigger est coupé le temps de l'écrire, comme l'aurait fait une version antérieure de la base.
alter table public.transactions disable trigger transactions_check_category_group;
insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on) values
  ('00000000-0000-0000-0000-00000000fd03', '00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000fa01',
   '00000000-0000-0000-0000-00000000fc01', 'expense', 3000, '2026-10-01');
alter table public.transactions enable trigger transactions_check_category_group;

create temp table default_ids on commit drop as
select (select id from public.categories where group_id is null and name = 'Divers') as divers;
grant select on default_ids to authenticated;

-- ---------------------------------------------------------------------------
-- Écritures d'Alice dans B
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000fa01","role":"authenticated"}', true);

SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on)
    values ('00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000fa01',
            '00000000-0000-0000-0000-00000000fc01', 'expense', 500, '2026-10-02')$$,
  'P0001',
  'Cette catégorie n’appartient pas à ce budget.',
  'Une operation de B refuse une categorie de A'
);

SELECT lives_ok(
  $$insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on)
    values ('00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000fa01',
            '00000000-0000-0000-0000-00000000fc03', 'expense', 500, '2026-10-02')$$,
  'Une operation de B accepte une categorie de B'
);

SELECT lives_ok(
  $$insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on)
    values ('00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000fa01',
            (select divers from default_ids), 'expense', 500, '2026-10-02')$$,
  'Une operation de B accepte une categorie par defaut'
);

SELECT throws_ok(
  $$update public.transactions set category_id = '00000000-0000-0000-0000-00000000fc01'
     where id = '00000000-0000-0000-0000-00000000fd01'$$,
  'P0001',
  'Cette catégorie n’appartient pas à ce budget.',
  'Une operation de B ne passe pas dans une categorie de A'
);

SELECT throws_ok(
  $$insert into public.budgets (group_id, category_id, amount)
    values ('00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000fc01', 10000)$$,
  'P0001',
  'Cette catégorie n’appartient pas à ce budget.',
  'Un budget de B refuse une categorie de A'
);

SELECT throws_ok(
  $$insert into public.recurring_transactions (group_id, user_id, category_id, type, amount, frequency, anchor_day, next_due_on)
    values ('00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000fa01',
            '00000000-0000-0000-0000-00000000fc01', 'expense', 500, 'monthly', 5, '2026-10-05')$$,
  'P0001',
  'Cette catégorie n’appartient pas à ce budget.',
  'Un modele recurrent de B refuse une categorie de A'
);

SELECT lives_ok(
  $$update public.transactions
       set amount = 3500, category_id = '00000000-0000-0000-0000-00000000fc01'
     where id = '00000000-0000-0000-0000-00000000fd03'$$,
  'Une ligne deja enregistree ainsi reste modifiable sur ses autres champs'
);

-- ---------------------------------------------------------------------------
-- Suppression avec report, par Carol, lectrice de B
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000fa03","role":"authenticated"}', true);

SELECT lives_ok(
  $$select public.delete_category('00000000-0000-0000-0000-00000000fc01', '00000000-0000-0000-0000-00000000fc02')$$,
  'Carol supprime Animaux de A, reportee sur Sport'
);

set local role postgres;

SELECT is(
  (select category_id from public.transactions where id = '00000000-0000-0000-0000-00000000fd02'),
  '00000000-0000-0000-0000-00000000fc02'::uuid,
  'L''operation de A passe sur Sport'
);

SELECT is(
  (select category_id from public.transactions where id = '00000000-0000-0000-0000-00000000fd03'),
  null::uuid,
  'L''operation de B n''est pas rangee dans Sport, categorie de A : elle perd seulement la sienne'
);

SELECT is(
  (select category_id from public.transactions where id = '00000000-0000-0000-0000-00000000fd01'),
  '00000000-0000-0000-0000-00000000fc03'::uuid,
  'Les autres operations de B ne bougent pas'
);

SELECT * FROM finish();
ROLLBACK;
