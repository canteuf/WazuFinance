-- Livre de comptes : totaux par jour sous filtres, et montants fréquents de l'appelant.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(12);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'alice-l@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c2', 'bob-l@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c3', 'eve-l@example.com',   '{"display_name": "Eve"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000d1', 'Coloc', '00000000-0000-0000-0000-0000000000c1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'owner'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c2', 'member');

-- Deux jours d'historique, plus une ligne hors période pour vérifier la borne haute.
insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on, note) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1',
   (select id from public.categories where group_id is null and name = 'Salaire'),
   'income', 1000.00, '2026-10-19', 'Salaire octobre'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 24.90, '2026-10-19', 'Biocoop -50% fruits'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1',
   (select id from public.categories where group_id is null and name = 'Logement'),
   'expense', 100.10, '2026-10-18', 'Loyer'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1',
   (select id from public.categories where group_id is null and name = 'Logement'),
   'expense', 500.00, '2026-11-01', 'Hors période');

-- Habitudes d'Alice : 4,50 € trois fois, 12,00 € deux fois, 7,00 € une seule fois. Bob, dans le même groupe, saisit 99,00 € plus souvent qu'elle ne saisit quoi que ce soit.
insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on)
select '00000000-0000-0000-0000-0000000000d1', a.user_id,
       (select id from public.categories where group_id is null and name = 'Alimentation'),
       'expense', a.amount, '2026-09-01'
  from (values
    ('00000000-0000-0000-0000-0000000000c1'::uuid, 4.50),
    ('00000000-0000-0000-0000-0000000000c1'::uuid, 4.50),
    ('00000000-0000-0000-0000-0000000000c1'::uuid, 4.50),
    ('00000000-0000-0000-0000-0000000000c1'::uuid, 12.00),
    ('00000000-0000-0000-0000-0000000000c1'::uuid, 12.00),
    ('00000000-0000-0000-0000-0000000000c1'::uuid, 7.00),
    ('00000000-0000-0000-0000-0000000000c2'::uuid, 99.00),
    ('00000000-0000-0000-0000-0000000000c2'::uuid, 99.00),
    ('00000000-0000-0000-0000-0000000000c2'::uuid, 99.00),
    ('00000000-0000-0000-0000-0000000000c2'::uuid, 99.00)
  ) as a(user_id, amount);

-- ---------------------------------------------------------------------------
-- daily_totals, en tant qu'Alice
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

SELECT is(
  (select count(*)::integer from public.daily_totals(
     '00000000-0000-0000-0000-0000000000d1', '2026-10-01', '2026-11-01')),
  2,
  'Un total par jour ayant des écritures, borne haute exclue'
);

-- 1 000,00 − 24,90 : le total est signé, et exact en numeric.
SELECT is(
  (select total from public.daily_totals(
     '00000000-0000-0000-0000-0000000000d1', '2026-10-01', '2026-11-01')
    where occurred_on = '2026-10-19')::numeric(12,2),
  975.10::numeric(12,2),
  'Le total du jour est signé : entrées moins sorties'
);

SELECT is(
  (select tx_count from public.daily_totals(
     '00000000-0000-0000-0000-0000000000d1', '2026-10-01', '2026-11-01')
    where occurred_on = '2026-10-19'),
  2,
  'Le jour compte ses écritures'
);

SELECT is(
  (select total from public.daily_totals(
     '00000000-0000-0000-0000-0000000000d1', '2026-10-01', '2026-11-01', 'expense')
    where occurred_on = '2026-10-19')::numeric(12,2),
  -24.90::numeric(12,2),
  'Le filtre de type s''applique aux totaux comme à la liste'
);

SELECT is(
  (select count(*)::integer from public.daily_totals(
     '00000000-0000-0000-0000-0000000000d1', null, null, null, null, 'BIOCOOP')),
  1,
  'La recherche porte sur la note, sans tenir compte de la casse'
);

-- « % » est un caractère comme un autre : il ne doit ni tout faire correspondre, ni rien.
SELECT is(
  (select count(*)::integer from public.daily_totals(
     '00000000-0000-0000-0000-0000000000d1', null, null, null, null, '%')),
  1,
  'Un « % » cherché n''est pas un joker'
);

SELECT is(
  (select count(*)::integer from public.daily_totals(
     '00000000-0000-0000-0000-0000000000d1', null, null, null, null, 'introuvable')),
  0,
  'Une recherche sans résultat ne rend aucun jour'
);

-- ---------------------------------------------------------------------------
-- frequent_amounts, en tant qu'Alice
-- ---------------------------------------------------------------------------

-- Les 99,00 € de Bob, plus fréquents, n'apparaissent pas : ce sont ses habitudes, pas celles d'Alice. Les 7,00 € saisis une fois non plus.
SELECT is(
  (select array_agg(amount::numeric(12,2)) from public.frequent_amounts(
     '00000000-0000-0000-0000-0000000000d1', 'expense')),
  array[4.50, 12.00]::numeric(12,2)[],
  'Les montants répétés de l''appelant seul, du plus fréquent au moins fréquent'
);

SELECT is(
  (select count(*)::integer from public.frequent_amounts(
     '00000000-0000-0000-0000-0000000000d1', 'income')),
  0,
  'Aucune habitude sur un type jamais répété'
);

-- ---------------------------------------------------------------------------
-- Eve, étrangère au groupe
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);

SELECT is(
  (select count(*)::integer from public.daily_totals('00000000-0000-0000-0000-0000000000d1')),
  0,
  'Un non-membre ne voit aucun total'
);

SELECT is(
  (select count(*)::integer from public.frequent_amounts(
     '00000000-0000-0000-0000-0000000000d1', 'expense')),
  0,
  'Un non-membre ne voit aucun montant'
);

set local role anon;

SELECT throws_ok(
  $$select * from public.daily_totals('00000000-0000-0000-0000-0000000000d1')$$,
  '42501',
  NULL,
  'Un visiteur anonyme ne peut pas appeler daily_totals'
);

SELECT * FROM finish();
ROLLBACK;
