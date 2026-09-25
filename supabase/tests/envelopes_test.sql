-- Versements sur les objectifs, ajustements de plafond, totaux d'en-tête des écrans Épargne et Budgets.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(17);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'alice-e@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e2', 'bob-e@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e3', 'eve-e@example.com',   '{"display_name": "Eve"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000f1', 'Coloc', '00000000-0000-0000-0000-0000000000e1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'owner'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e2', 'member');

-- Deux objectifs d'Alice, un de Bob. Le voyage : 1 850,00 sur 3 200,00, échéance en mai 2027, soit huit mois après septembre 2026.
insert into public.savings_goals (id, user_id, name, target_amount, current_amount, target_date) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'Voyage', 3200.00, 1850.00, '2027-05-31'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1', 'Vélo', 1200.00, 1200.00, null),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000e2', 'Bob', 500.00, 100.00, '2026-12-31');

-- Deux enveloppes du groupe : Alimentation 500,00, Logement 200,00. Loisirs n'en a pas.
insert into public.budgets (id, group_id, category_id, amount) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Alimentation'), 500.00),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Logement'), 200.00);

insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1',
   (select id from public.categories where group_id is null and name = 'Alimentation'), 'expense', 24.90, '2026-09-10'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e2',
   (select id from public.categories where group_id is null and name = 'Logement'), 'expense', 100.10, '2026-09-12'),
  -- Hors enveloppe : ne consomme aucun plafond.
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1',
   (select id from public.categories where group_id is null and name = 'Loisirs'), 'expense', 60.00, '2026-09-12'),
  -- Hors période.
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1',
   (select id from public.categories where group_id is null and name = 'Alimentation'), 'expense', 300.00, '2026-10-01');

-- ---------------------------------------------------------------------------
-- Versements, en tant qu'Alice
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

SELECT is(
  (select current_amount from public.add_to_savings_goal('00000000-0000-0000-0000-0000000000a1', 200)),
  2050.00::numeric(12,2),
  'Un versement s''ajoute au montant présent, exactement'
);

SELECT is(
  (select current_amount from public.add_to_savings_goal('00000000-0000-0000-0000-0000000000a1', -50)),
  2000.00::numeric(12,2),
  'Un retrait s''en déduit'
);

SELECT throws_ok(
  $$select public.add_to_savings_goal('00000000-0000-0000-0000-0000000000a1', -2001)$$,
  'P0001', 'Le retrait dépasse le montant épargné.',
  'Un retrait plus grand que l''épargne est refusé'
);

SELECT throws_ok(
  $$select public.add_to_savings_goal('00000000-0000-0000-0000-0000000000a1', 0)$$,
  'P0001', 'Indiquez un montant entier, différent de zéro.',
  'Un versement nul est refusé'
);

SELECT throws_ok(
  $$select public.add_to_savings_goal('00000000-0000-0000-0000-0000000000a1', 1.5)$$,
  'P0001', 'Indiquez un montant entier, différent de zéro.',
  'Un versement avec des décimales est refusé : le franc CFA n''a pas de centimes'
);

SELECT throws_ok(
  $$select public.add_to_savings_goal('00000000-0000-0000-0000-0000000000a3', 10)$$,
  'P0001', 'Cet objectif n''existe plus.',
  'L''objectif d''un autre utilisateur est introuvable, pas modifiable'
);

-- ---------------------------------------------------------------------------
-- Totaux d'épargne, en tant qu'Alice
-- ---------------------------------------------------------------------------

-- Voyage : 3 200,00 − 2 000,00 = 1 200,00 sur 8 mois (septembre 2026 à mai 2027) = 150,00 par mois. Le vélo, atteint et sans échéance, n'a pas de rythme.
SELECT is(
  (select monthly_rhythm from public.savings_plans('2026-09-19') where goal_id = '00000000-0000-0000-0000-0000000000a1'),
  150.00::numeric,
  'Le rythme répartit le reste sur les mois jusqu''à l''échéance'
);

SELECT is(
  (select count(*)::integer from public.savings_plans('2026-09-19')),
  1,
  'Seuls les objectifs en cours avec une échéance ont un rythme, et seulement ceux de l''appelant'
);

-- 1 200,00 − 1 000,00 = 200,00 à répartir sur 3 mois : 66,666… arrondi au centime supérieur.
update public.savings_goals set current_amount = 1000.00, target_date = '2026-12-01'
 where id = '00000000-0000-0000-0000-0000000000a2';

SELECT is(
  (select monthly_rhythm from public.savings_plans('2026-09-19') where goal_id = '00000000-0000-0000-0000-0000000000a2'),
  66.67::numeric,
  'Le rythme est arrondi au centime supérieur'
);

-- Échéance passée : tout le reste, en un mois.
SELECT is(
  (select monthly_rhythm from public.savings_plans('2027-02-01') where goal_id = '00000000-0000-0000-0000-0000000000a2'),
  200.00::numeric,
  'Une échéance passée demande tout le reste'
);

-- 2 000,00 + 1 000,00 épargnés ; 150,00 + 66,67 par mois. L'objectif de Bob n'entre dans aucun des deux.
SELECT results_eq(
  $$select total_saved, monthly_effort from public.savings_overview('2026-09-19')$$,
  $$values (3000.00::numeric, 216.67::numeric)$$,
  'Le total épargné et l''effort mensuel ne portent que sur les objectifs de l''appelant'
);

-- ---------------------------------------------------------------------------
-- Enveloppes, en tant que Bob (membre du groupe)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);

SELECT is(
  (select amount from public.adjust_budget_amount('00000000-0000-0000-0000-0000000000b2', 50.00)),
  250.00::numeric(12,2),
  'Un membre augmente le plafond d''une enveloppe du groupe'
);

SELECT throws_ok(
  $$select public.adjust_budget_amount('00000000-0000-0000-0000-0000000000b2', -250.00)$$,
  'P0001', 'Le plafond doit rester supérieur à zéro.',
  'Un plafond ne descend pas à zéro'
);

-- 500,00 + 250,00 de plafonds ; 24,90 + 100,10 dépensés dans ces catégories sur septembre. Les 60,00 de Loisirs et les 300,00 d'octobre n'y sont pas.
SELECT results_eq(
  $$select spent, ceiling, remaining from public.budget_totals('00000000-0000-0000-0000-0000000000f1', '2026-09-01', '2026-10-01')$$,
  $$values (125.00::numeric, 750.00::numeric, 625.00::numeric)$$,
  'Les totaux ne comptent que la dépense des catégories qui ont une enveloppe, sur la période'
);

-- ---------------------------------------------------------------------------
-- Eve, hors du groupe
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);

SELECT throws_ok(
  $$select public.adjust_budget_amount('00000000-0000-0000-0000-0000000000b1', 10)$$,
  'P0001', 'Ce budget n''existe plus.',
  'Un non-membre ne peut pas ajuster une enveloppe'
);

SELECT results_eq(
  $$select spent, ceiling from public.budget_totals('00000000-0000-0000-0000-0000000000f1', '2026-09-01', '2026-10-01')$$,
  $$values (0::numeric, 0::numeric)$$,
  'Un non-membre obtient des totaux nuls'
);

-- ---------------------------------------------------------------------------
-- Journal : l'ajustement de Bob est une modification ordinaire
-- ---------------------------------------------------------------------------

reset role;

SELECT is(
  (select count(*)::integer from public.activity_log
    where subject = 'budget' and action = 'update'
      and (old_values ->> 'amount')::numeric = 200.00
      and (new_values ->> 'amount')::numeric = 250.00),
  1,
  'L''ajustement de plafond est journalisé avec l''ancien et le nouveau montant'
);

SELECT * FROM finish();
ROLLBACK;
