-- Totaux sous filtres du relevé PDF : mêmes lignes que daily_totals(), sommées exactement.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(8);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'alice-f@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e3', 'eve-f@example.com',   '{"display_name": "Eve"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000f1', 'Coloc', '00000000-0000-0000-0000-0000000000e1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'owner');

-- 0,10 + 0,20 : la somme qu'un flottant binaire rend 0,30000000000000004.
insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on, note) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1',
   (select id from public.categories where group_id is null and name = 'Salaire'),
   'income', 1000.00, '2026-10-19', 'Salaire octobre'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 0.10, '2026-10-19', 'Marché'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 0.20, '2026-10-18', 'MARCHÉ bio'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1',
   (select id from public.categories where group_id is null and name = 'Logement'),
   'expense', 500.00, '2026-11-01', 'Hors période');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

SELECT is(
  (select row(income, expense, balance, tx_count)::text from public.filtered_totals(
     '00000000-0000-0000-0000-0000000000f1', '2026-10-01', '2026-11-01')),
  '(1000.00,0.30,999.70,3)',
  'Entrées, sorties, solde et nombre d''écritures de la période, borne haute exclue'
);

SELECT is(
  (select tx_count from public.filtered_totals('00000000-0000-0000-0000-0000000000f1')),
  4,
  'Sans borne, tout l''historique compte'
);

SELECT is(
  (select expense::text from public.filtered_totals(
     '00000000-0000-0000-0000-0000000000f1', null, null, null,
     (select id from public.categories where group_id is null and name = 'Alimentation'))),
  '0.30',
  'Le filtre de catégorie s''applique, et la somme reste exacte'
);

SELECT is(
  (select row(income, tx_count)::text from public.filtered_totals(
     '00000000-0000-0000-0000-0000000000f1', null, null, 'expense')),
  '(0,3)',
  'Le filtre de type exclut les entrées'
);

SELECT is(
  (select tx_count from public.filtered_totals(
     '00000000-0000-0000-0000-0000000000f1', null, null, null, null, 'marché')),
  2,
  'La recherche porte sur la note, sans tenir compte de la casse'
);

-- Mêmes lignes que daily_totals() sous les mêmes filtres : le relevé et l'historique ne divergent pas.
SELECT is(
  (select tx_count from public.filtered_totals(
     '00000000-0000-0000-0000-0000000000f1', '2026-10-01', '2026-11-01', null, null, 'march')),
  (select sum(tx_count)::integer from public.daily_totals(
     '00000000-0000-0000-0000-0000000000f1', '2026-10-01', '2026-11-01', null, null, 'march')),
  'Même décompte que daily_totals sous les mêmes filtres'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);

SELECT is(
  (select row(income, expense, balance, tx_count)::text from public.filtered_totals(
     '00000000-0000-0000-0000-0000000000f1')),
  '(0,0,0,0)',
  'Un non-membre obtient des totaux nuls'
);

set local role anon;

SELECT throws_ok(
  $$select * from public.filtered_totals('00000000-0000-0000-0000-0000000000f1')$$,
  '42501',
  NULL,
  'Un visiteur anonyme ne peut pas appeler filtered_totals'
);

SELECT * FROM finish();
ROLLBACK;
