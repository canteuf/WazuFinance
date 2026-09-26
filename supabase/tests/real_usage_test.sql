-- Usages réels (migration real_usage) : étiquettes, filtres de l'historique, vente à crédit, portefeuille au choix, carte Commerce.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(30);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007a1', 'awa-r@example.com', '{"display_name": "Awa"}'::jsonb),
  ('00000000-0000-0000-0000-0000000007a2', 'eve-r@example.com', '{"display_name": "Eve"}'::jsonb);

create temporary table r_ids as
select
  (select id from public.budget_groups where owner_id = '00000000-0000-0000-0000-0000000007a1' and is_personal) as awa_group,
  (select id from public.budget_groups where owner_id = '00000000-0000-0000-0000-0000000007a2' and is_personal) as eve_group,
  (select id from public.categories where group_id is null and name = 'Commerce' and type = 'income') as commerce,
  (select id from public.categories where group_id is null and name = 'Achat de stock' and type = 'expense') as stock,
  (select id from public.categories where group_id is null and name = 'Alimentation' and type = 'expense') as food;
grant select on r_ids to authenticated;

-- Un portefeuille MoMo pour Awa, un portefeuille pour Eve.
insert into public.wallets (id, group_id, name, kind) values
  ('00000000-0000-0000-0000-0000000007b1', (select awa_group from r_ids), 'MoMo', 'mobile_money'),
  ('00000000-0000-0000-0000-0000000007b2', (select eve_group from r_ids), 'Banque', 'bank');

SELECT isnt(
  (select stock from r_ids),
  NULL,
  'La catégorie par défaut « Achat de stock » existe'
);

-- ---------------------------------------------------------------------------
-- En tant qu'Awa
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000007a1","role":"authenticated"}', true);

-- Étiquettes

SELECT lives_ok(
  $$insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on, tags)
    values ('00000000-0000-0000-0000-0000000007c1', (select awa_group from r_ids), '00000000-0000-0000-0000-0000000007a1',
            (select food from r_ids), 'expense', 3000, '2026-09-10', array['Argent de Jean', 'Rentrée 2027'])$$,
  'Une opération porte des étiquettes'
);

SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on, tags)
    values ((select awa_group from r_ids), '00000000-0000-0000-0000-0000000007a1', (select food from r_ids),
            'expense', 1, '2026-09-10', array['a', 'b', 'c', 'd', 'e', 'f'])$$,
  '23514',
  NULL,
  'Pas plus de cinq étiquettes'
);

SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on, tags)
    values ((select awa_group from r_ids), '00000000-0000-0000-0000-0000000007a1', (select food from r_ids),
            'expense', 1, '2026-09-10', array['Jean', 'jean'])$$,
  '23514',
  NULL,
  'Pas deux fois la même étiquette, casse ignorée'
);

SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on, tags)
    values ((select awa_group from r_ids), '00000000-0000-0000-0000-0000000007a1', (select food from r_ids),
            'expense', 1, '2026-09-10', array[' Jean'])$$,
  '23514',
  NULL,
  'Pas d''espace en bordure d''une étiquette'
);

insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on, tags, wallet_id)
values
  ('00000000-0000-0000-0000-0000000007c2', (select awa_group from r_ids), '00000000-0000-0000-0000-0000000007a1',
   (select stock from r_ids), 'expense', 20000, '2026-09-11', array['Argent de Jean'], '00000000-0000-0000-0000-0000000007b1'),
  ('00000000-0000-0000-0000-0000000007c3', (select awa_group from r_ids), '00000000-0000-0000-0000-0000000007a1',
   (select commerce from r_ids), 'income', 35000, '2026-09-12', '{}', '00000000-0000-0000-0000-0000000007b1');

SELECT results_eq(
  $$select tag, uses from public.transaction_tags((select awa_group from r_ids))$$,
  $$values ('Argent de Jean'::text, 2), ('Rentrée 2027'::text, 1)$$,
  'transaction_tags() donne les étiquettes du groupe, les plus utilisées d''abord'
);

-- Filtres de l'historique

SELECT is(
  (select expense from public.filtered_totals((select awa_group from r_ids), p_tag => 'Argent de Jean')),
  23000::numeric,
  'filtered_totals() filtre par étiquette'
);

SELECT is(
  (select tx_count from public.filtered_totals((select awa_group from r_ids),
     p_category_ids => array[(select food from r_ids), (select commerce from r_ids)])),
  2,
  'filtered_totals() filtre sur plusieurs catégories'
);

SELECT is(
  (select balance from public.filtered_totals((select awa_group from r_ids), p_wallet_id => '00000000-0000-0000-0000-0000000007b1')),
  15000::numeric,
  'filtered_totals() filtre par portefeuille'
);

SELECT is(
  (select sum(tx_count)::int from public.daily_totals((select awa_group from r_ids), p_wallet_id => '00000000-0000-0000-0000-0000000007b1', p_tag => 'Argent de Jean')),
  1,
  'daily_totals() applique les mêmes filtres'
);

SELECT is(
  (select tx_count from public.filtered_totals((select awa_group from r_ids), p_category_id => (select food from r_ids))),
  1,
  'L''ancien paramètre p_category_id reste compris'
);

SELECT results_eq(
  $$select name, type, total from public.filtered_category_totals((select awa_group from r_ids), '2026-09-01', '2026-10-01')$$,
  $$values ('Achat de stock'::text, 'expense'::public.transaction_type, 20000::numeric),
           ('Alimentation'::text, 'expense'::public.transaction_type, 3000::numeric),
           ('Commerce'::text, 'income'::public.transaction_type, 35000::numeric)$$,
  'filtered_category_totals() donne les sous-totaux par catégorie'
);

-- Commerce

SELECT results_eq(
  $$select sales, stock, margin, tx_count from public.commerce_summary((select awa_group from r_ids), '2026-09-01', '2026-10-01')$$,
  $$values (35000::numeric, 20000::numeric, 15000::numeric, 2)$$,
  'commerce_summary() donne ventes et achats de stock'
);

-- Vente à crédit

SELECT lives_ok(
  $$select public.create_debt('00000000-0000-0000-0000-0000000007d1', (select awa_group from r_ids), 'credit_sale',
      'Mama Ngo', 12000, '2026-09-13', '00000000-0000-0000-0000-0000000007e1')$$,
  'Awa vend à crédit à Mama Ngo'
);

SELECT is(
  (select count(*)::int from public.transactions where debt_id = '00000000-0000-0000-0000-0000000007d1'),
  0,
  'Une vente à crédit ne fait rien entrer au solde le jour de la vente'
);

SELECT throws_ok(
  $$select public.record_debt_payment('00000000-0000-0000-0000-0000000007d1', 13000, '2026-09-14', '00000000-0000-0000-0000-0000000007e2')$$,
  'P0001',
  'Le remboursement dépasse ce qui reste dû.',
  'Un versement ne dépasse pas le reste dû'
);

SELECT lives_ok(
  $$select public.record_debt_payment('00000000-0000-0000-0000-0000000007d1', 5000, '2026-09-14',
      '00000000-0000-0000-0000-0000000007e3', '00000000-0000-0000-0000-0000000007b1')$$,
  'Mama Ngo verse 5 000 sur le MoMo'
);

SELECT results_eq(
  $$select type, category_id, wallet_id from public.transactions where id = '00000000-0000-0000-0000-0000000007e3'$$,
  $$select 'income'::public.transaction_type, (select commerce from r_ids), '00000000-0000-0000-0000-0000000007b1'::uuid$$,
  'Le versement est un revenu « Commerce », sur le portefeuille choisi'
);

SELECT results_eq(
  $$select paid, remaining from public.debts_overview((select awa_group from r_ids)) where id = '00000000-0000-0000-0000-0000000007d1'$$,
  $$values (5000::numeric, 7000::numeric)$$,
  'debts_overview() compte le versement du client'
);

SELECT is(
  (select owed_to_us from public.debts_totals((select awa_group from r_ids))),
  7000::numeric,
  '« On vous doit » compte les clients'
);

SELECT results_eq(
  $$select income, debts from public.period_summary((select awa_group from r_ids), '2026-09-01', '2026-10-01')$$,
  $$values (40000::numeric, 0::numeric)$$,
  'Le versement compte dans les revenus, pas sur la ligne des prêts'
);

SELECT is(
  (select sales from public.commerce_summary((select awa_group from r_ids), '2026-09-01', '2026-10-01')),
  40000::numeric,
  'Il compte aussi dans les ventes'
);

-- Portefeuille au choix

select public.create_debt('00000000-0000-0000-0000-0000000007d2', (select awa_group from r_ids), 'lent',
  'Paul', 8000, '2026-09-15', '00000000-0000-0000-0000-0000000007e4', p_wallet_id => '00000000-0000-0000-0000-0000000007b1');

SELECT is(
  (select wallet_id from public.transactions where id = '00000000-0000-0000-0000-0000000007e4'),
  '00000000-0000-0000-0000-0000000007b1'::uuid,
  'Un prêt sort du portefeuille choisi'
);

SELECT results_eq(
  $$select income, expense, debts from public.period_summary((select awa_group from r_ids), '2026-09-01', '2026-10-01')$$,
  $$values (40000::numeric, 23000::numeric, -8000::numeric)$$,
  'Un prêt reste sur sa propre ligne'
);

SELECT throws_ok(
  $$select public.create_debt('00000000-0000-0000-0000-0000000007d3', (select awa_group from r_ids), 'lent',
      'Paul', 1000, '2026-09-15', '00000000-0000-0000-0000-0000000007e5', p_wallet_id => '00000000-0000-0000-0000-0000000007b2')$$,
  'P0001',
  'Ce portefeuille n''appartient pas à ce budget.',
  'Un portefeuille d''un autre groupe est refusé'
);

insert into public.recurring_transactions (id, group_id, user_id, category_id, type, amount, frequency, anchor_day, next_due_on, wallet_id)
values ('00000000-0000-0000-0000-0000000007f1', (select awa_group from r_ids), '00000000-0000-0000-0000-0000000007a1',
        (select food from r_ids), 'expense', 2000, 'monthly', 5, '2026-09-05', '00000000-0000-0000-0000-0000000007b1');

SELECT throws_ok(
  $$update public.recurring_transactions set wallet_id = '00000000-0000-0000-0000-0000000007b2'
     where id = '00000000-0000-0000-0000-0000000007f1'$$,
  'P0001',
  'Ce portefeuille n''appartient pas à ce budget.',
  'Une opération récurrente refuse un portefeuille d''un autre groupe'
);

select public.confirm_recurring('00000000-0000-0000-0000-0000000007f1', '2026-09-05', '00000000-0000-0000-0000-0000000007e6');

SELECT is(
  (select wallet_id from public.transactions where id = '00000000-0000-0000-0000-0000000007e6'),
  '00000000-0000-0000-0000-0000000007b1'::uuid,
  'Une échéance confirmée reprend le portefeuille du modèle'
);

select public.confirm_recurring('00000000-0000-0000-0000-0000000007f1', '2026-10-05', '00000000-0000-0000-0000-0000000007e7',
  p_wallet_id => (select id from public.wallets where group_id = (select awa_group from r_ids) and is_default));

SELECT is(
  (select w.is_default from public.transactions t join public.wallets w on w.id = t.wallet_id
    where t.id = '00000000-0000-0000-0000-0000000007e7'),
  true,
  'Ou celui choisi à la confirmation'
);

insert into public.savings_goals (id, user_id, name, target_amount)
values ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-0000000007a1', 'Moto', 500000);

SELECT lives_ok(
  $$select public.add_to_savings_goal('00000000-0000-0000-0000-000000000701', 10000, '2026-09-16',
      '00000000-0000-0000-0000-0000000007e8', '00000000-0000-0000-0000-0000000007b1')$$,
  'Un versement d''épargne part du portefeuille choisi'
);

SELECT is(
  (select wallet_id from public.transactions where id = '00000000-0000-0000-0000-0000000007e8'),
  '00000000-0000-0000-0000-0000000007b1'::uuid,
  'L''opération d''épargne porte ce portefeuille'
);

SELECT * FROM finish();
ROLLBACK;
