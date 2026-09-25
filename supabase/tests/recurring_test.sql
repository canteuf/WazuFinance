-- Opérations récurrentes et budgets hebdomadaires (migration recurring_and_weekly).
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(19);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000003a1', 'alice-r@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000003a2', 'bob-r@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000003a3', 'eve-r@example.com',   '{"display_name": "Eve"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000003b1', 'Famille', '00000000-0000-0000-0000-0000000003a1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000003b1', '00000000-0000-0000-0000-0000000003a1', 'owner'),
  ('00000000-0000-0000-0000-0000000003b1', '00000000-0000-0000-0000-0000000003a2', 'member');

-- ---------------------------------------------------------------------------
-- Échéance suivante
-- ---------------------------------------------------------------------------

SELECT is(
  public.next_recurrence('monthly', 5::smallint, '2026-09-05'),
  '2026-10-05'::date,
  'Mensuelle : le même jour, le mois suivant'
);

SELECT is(
  public.next_recurrence('monthly', 28::smallint, '2026-12-28'),
  '2027-01-28'::date,
  'Mensuelle : le passage d''année'
);

SELECT is(
  public.next_recurrence('weekly', 1::smallint, '2026-09-28'),
  '2026-10-05'::date,
  'Hebdomadaire : sept jours plus tard'
);

-- ---------------------------------------------------------------------------
-- Création, en tant qu'Alice
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000003a1","role":"authenticated"}', true);

SELECT lives_ok(
  $$insert into public.recurring_transactions
      (id, group_id, user_id, category_id, type, amount, note, frequency, anchor_day, next_due_on)
    values ('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003b1',
            '00000000-0000-0000-0000-0000000003a1',
            (select id from public.categories where group_id is null and name = 'Logement'),
            'expense', 75000, 'Loyer', 'monthly', 5, '2026-09-05')$$,
  'Un membre crée un loyer mensuel le 5'
);

SELECT throws_ok(
  $$insert into public.recurring_transactions
      (group_id, user_id, type, amount, frequency, anchor_day, next_due_on)
    values ('00000000-0000-0000-0000-0000000003b1', '00000000-0000-0000-0000-0000000003a1',
            'expense', 1000, 'monthly', 5, '2026-09-06')$$,
  '23514',
  NULL,
  'Une échéance qui ne tombe pas sur le jour choisi est refusée'
);

SELECT throws_ok(
  $$insert into public.recurring_transactions
      (group_id, user_id, type, amount, frequency, anchor_day, next_due_on)
    values ('00000000-0000-0000-0000-0000000003b1', '00000000-0000-0000-0000-0000000003a1',
            'expense', 1000, 'monthly', 31, '2026-10-31')$$,
  '23514',
  NULL,
  'Un jour au-delà du 28 est refusé : il n''existe pas tous les mois'
);

SELECT throws_ok(
  $$insert into public.recurring_transactions
      (group_id, user_id, type, amount, frequency, anchor_day, next_due_on)
    values ('00000000-0000-0000-0000-0000000003b1', '00000000-0000-0000-0000-0000000003a2',
            'expense', 1000, 'monthly', 5, '2026-09-05')$$,
  '42501',
  NULL,
  'On ne crée pas une récurrence au nom d''un autre membre'
);

SELECT throws_ok(
  $$update public.recurring_transactions set frequency = 'weekly'
     where id = '00000000-0000-0000-0000-0000000003c1'$$,
  '42501',
  NULL,
  'Le rythme d''une récurrence ne se modifie pas'
);

-- ---------------------------------------------------------------------------
-- Confirmation, en tant que Bob, autre membre du groupe
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000003a2","role":"authenticated"}', true);

SELECT is(
  (select amount from public.confirm_recurring(
     '00000000-0000-0000-0000-0000000003c1', '2026-09-05',
     '00000000-0000-0000-0000-0000000003d1', null, '2026-09-06')),
  75000.00::numeric(12,2),
  'Bob confirme le loyer : l''opération reprend le montant du modèle'
);

SELECT results_eq(
  $$select group_id, user_id, type::text, occurred_on, note
      from public.transactions where id = '00000000-0000-0000-0000-0000000003d1'$$,
  $$values ('00000000-0000-0000-0000-0000000003b1'::uuid, '00000000-0000-0000-0000-0000000003a2'::uuid,
            'expense', '2026-09-06'::date, 'Loyer')$$,
  'L''opération est dans le groupe, au nom de celui qui confirme, à la date donnée'
);

SELECT is(
  (select next_due_on from public.recurring_transactions where id = '00000000-0000-0000-0000-0000000003c1'),
  '2026-10-05'::date,
  'L''échéance avance au mois suivant'
);

SELECT is(
  (select id from public.confirm_recurring(
     '00000000-0000-0000-0000-0000000003c1', '2026-09-05',
     '00000000-0000-0000-0000-0000000003d1')),
  '00000000-0000-0000-0000-0000000003d1'::uuid,
  'Renvoyer la même confirmation rend l''opération déjà créée, sans erreur'
);

SELECT is(
  (select count(*)::int from public.transactions
    where group_id = '00000000-0000-0000-0000-0000000003b1'),
  1,
  'Et sans doublon'
);

-- Alice, qui avait encore l'ancienne échéance à l'écran, confirme à son tour.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000003a1","role":"authenticated"}', true);

SELECT throws_ok(
  $$select public.confirm_recurring(
      '00000000-0000-0000-0000-0000000003c1', '2026-09-05',
      '00000000-0000-0000-0000-0000000003d2')$$,
  'P0001',
  'Cette échéance a déjà été traitée par un autre membre.',
  'Une échéance déjà confirmée par un autre membre est refusée'
);

-- Montant ajusté pour cette fois : l'électricité varie.
SELECT is(
  (select amount from public.confirm_recurring(
     '00000000-0000-0000-0000-0000000003c1', '2026-10-05',
     '00000000-0000-0000-0000-0000000003d3', 80000)),
  80000.00::numeric(12,2),
  'Le montant peut être ajusté pour cette échéance'
);

SELECT is(
  (select amount from public.recurring_transactions where id = '00000000-0000-0000-0000-0000000003c1'),
  75000.00::numeric(12,2),
  'Sans changer le montant du modèle'
);

-- ---------------------------------------------------------------------------
-- Passer une échéance
-- ---------------------------------------------------------------------------

select public.skip_recurring('00000000-0000-0000-0000-0000000003c1', '2026-11-05');
select public.skip_recurring('00000000-0000-0000-0000-0000000003c1', '2026-11-05');

SELECT is(
  (select next_due_on from public.recurring_transactions where id = '00000000-0000-0000-0000-0000000003c1'),
  '2026-12-05'::date,
  'Passer avance l''échéance une seule fois, même rejoué'
);

-- ---------------------------------------------------------------------------
-- Eve, hors du groupe
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000003a3","role":"authenticated"}', true);

SELECT throws_ok(
  $$select public.confirm_recurring(
      '00000000-0000-0000-0000-0000000003c1', '2026-12-05',
      '00000000-0000-0000-0000-0000000003d4')$$,
  'P0001',
  'Cette opération récurrente n''existe plus.',
  'Un non-membre ne voit ni ne confirme la récurrence'
);

-- ---------------------------------------------------------------------------
-- Synthèse des budgets : les budgets hebdomadaires n'y entrent pas
-- ---------------------------------------------------------------------------

set local role postgres;

insert into public.budgets (group_id, category_id, period, amount) values
  ('00000000-0000-0000-0000-0000000003b1',
   (select id from public.categories where group_id is null and name = 'Logement'), 'monthly', 100000),
  ('00000000-0000-0000-0000-0000000003b1',
   (select id from public.categories where group_id is null and name = 'Transport'), 'weekly', 10000);

insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on) values
  ('00000000-0000-0000-0000-0000000003b1', '00000000-0000-0000-0000-0000000003a1',
   (select id from public.categories where group_id is null and name = 'Transport'), 'expense', 4000, '2026-09-10');

-- Logement : 75 000 (confirmé le 6 septembre) sur 100 000. Le transport, budget hebdomadaire, ne compte ni dans le plafond ni dans la dépense.
SELECT results_eq(
  $$select spent, ceiling from public.budget_totals('00000000-0000-0000-0000-0000000003b1', '2026-09-01', '2026-10-01')$$,
  $$values (75000.00::numeric, 100000.00::numeric)$$,
  'La synthèse ne totalise que les budgets mensuels'
);

SELECT * FROM finish();
ROLLBACK;
