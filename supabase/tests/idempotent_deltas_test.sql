-- Un versement ou un ajustement de plafond renvoyé avec le même identifiant ne compte qu'une fois (migration 20260926000400_idempotent_deltas.sql).
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000002e1', 'alice-i@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000002e2', 'bob-i@example.com', '{"display_name": "Bob"}'::jsonb);

insert into public.budgets (id, group_id, category_id, amount)
values (
  '00000000-0000-0000-0000-0000000002b1',
  (select id from public.budget_groups where owner_id = '00000000-0000-0000-0000-0000000002e1' and is_personal),
  (select id from public.categories where group_id is null and name = 'Alimentation'),
  10000
);

insert into public.savings_goals (id, user_id, name, target_amount, current_amount)
values ('00000000-0000-0000-0000-0000000002a1', '00000000-0000-0000-0000-0000000002e1', 'Moto', 500000, 0);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000002e1","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Plafonds
-- ---------------------------------------------------------------------------

select public.adjust_budget_amount('00000000-0000-0000-0000-0000000002b1', 2000, '00000000-0000-0000-0000-0000000002c1');
select public.adjust_budget_amount('00000000-0000-0000-0000-0000000002b1', 2000, '00000000-0000-0000-0000-0000000002c1');

SELECT is(
  (select amount from public.budgets where id = '00000000-0000-0000-0000-0000000002b1'),
  12000::numeric,
  'Un ajustement renvoyé avec le même identifiant ne compte qu''une fois'
);

select public.adjust_budget_amount('00000000-0000-0000-0000-0000000002b1', 1000, '00000000-0000-0000-0000-0000000002c2');

SELECT is(
  (select amount from public.budgets where id = '00000000-0000-0000-0000-0000000002b1'),
  13000::numeric,
  'Un second geste, avec son propre identifiant, compte'
);

select public.adjust_budget_amount('00000000-0000-0000-0000-0000000002b1', 500);
select public.adjust_budget_amount('00000000-0000-0000-0000-0000000002b1', 500);

SELECT is(
  (select amount from public.budgets where id = '00000000-0000-0000-0000-0000000002b1'),
  14000::numeric,
  'Sans identifiant (ancienne version de l''app), chaque appel compte'
);

-- Un refus annule la marque : le même identifiant, renvoyé avec un montant valide, s'applique.
SELECT throws_ok(
  $$select public.adjust_budget_amount('00000000-0000-0000-0000-0000000002b1', -20000, '00000000-0000-0000-0000-0000000002c3')$$,
  'P0001',
  'Le plafond doit rester supérieur à zéro.',
  'Un ajustement refusé lève son message'
);

select public.adjust_budget_amount('00000000-0000-0000-0000-0000000002b1', -4000, '00000000-0000-0000-0000-0000000002c3');

SELECT is(
  (select amount from public.budgets where id = '00000000-0000-0000-0000-0000000002b1'),
  10000::numeric,
  'Le refus n''a rien marqué : le renvoi corrigé s''applique'
);

SELECT throws_ok(
  $$select * from public.applied_requests$$,
  '42501',
  NULL,
  'Les marques ne se lisent pas'
);

-- La marque d'un compte ne touche pas aux gestes d'un autre (migration 20261010000100_scoped_request_claims.sql) : Bob marque d'avance un identifiant, l'ajustement d'Alice qui le porte s'applique quand même.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000002e2","role":"authenticated"}', true);
select public.claim_request('00000000-0000-0000-0000-0000000002c9');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000002e1","role":"authenticated"}', true);
select public.adjust_budget_amount('00000000-0000-0000-0000-0000000002b1', 1000, '00000000-0000-0000-0000-0000000002c9');
select public.adjust_budget_amount('00000000-0000-0000-0000-0000000002b1', -1000, '00000000-0000-0000-0000-0000000002ca');

SELECT is(
  (select amount from public.budgets where id = '00000000-0000-0000-0000-0000000002b1'),
  10000::numeric,
  'Un identifiant marqué par un autre compte ne bloque pas le geste'
);

-- ---------------------------------------------------------------------------
-- Épargne
-- ---------------------------------------------------------------------------

select public.add_to_savings_goal('00000000-0000-0000-0000-0000000002a1', 25000, '2026-09-20', '00000000-0000-0000-0000-0000000002d1');
select public.add_to_savings_goal('00000000-0000-0000-0000-0000000002a1', 25000, '2026-09-20', '00000000-0000-0000-0000-0000000002d1');

SELECT is(
  (select current_amount from public.savings_goals where id = '00000000-0000-0000-0000-0000000002a1'),
  25000::numeric,
  'Un versement renvoyé ne compte qu''une fois'
);

SELECT is(
  (select count(*)::integer from public.transactions where savings_goal_id = '00000000-0000-0000-0000-0000000002a1'),
  1,
  'Et ne crée qu''une opération d''épargne'
);

SELECT is(
  (select id from public.transactions where savings_goal_id = '00000000-0000-0000-0000-0000000002a1'),
  '00000000-0000-0000-0000-0000000002d1'::uuid,
  'L''opération porte l''identifiant du geste'
);

select public.add_to_savings_goal('00000000-0000-0000-0000-0000000002a1', -5000, '2026-09-21', '00000000-0000-0000-0000-0000000002d2');

SELECT is(
  (select current_amount from public.savings_goals where id = '00000000-0000-0000-0000-0000000002a1'),
  20000::numeric,
  'Un retrait avec son propre identifiant compte'
);

SELECT * FROM finish();
ROLLBACK;
