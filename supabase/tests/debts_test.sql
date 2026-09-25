-- Prêts et dettes (migration debts) : mouvements dans le solde, à part des dépenses et revenus.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(21);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004a1', 'alice-d@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000004a2', 'bob-d@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000004a3', 'eve-d@example.com',   '{"display_name": "Eve"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000004b1', 'Famille', '00000000-0000-0000-0000-0000000004a1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000004b1', '00000000-0000-0000-0000-0000000004a1', 'owner'),
  ('00000000-0000-0000-0000-0000000004b1', '00000000-0000-0000-0000-0000000004a2', 'member');

-- Un salaire de 200 000 et une dépense de 30 000, en septembre.
insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on) values
  ('00000000-0000-0000-0000-0000000004b1', '00000000-0000-0000-0000-0000000004a1',
   (select id from public.categories where group_id is null and name = 'Salaire'), 'income', 200000, '2026-09-01'),
  ('00000000-0000-0000-0000-0000000004b1', '00000000-0000-0000-0000-0000000004a1',
   (select id from public.categories where group_id is null and name = 'Alimentation'), 'expense', 30000, '2026-09-02');

-- ---------------------------------------------------------------------------
-- Alice prête 50 000 à Paul et emprunte 20 000 à Awa
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000004a1","role":"authenticated"}', true);

SELECT is(
  (select counterparty from public.create_debt(
     '00000000-0000-0000-0000-0000000004c1', '00000000-0000-0000-0000-0000000004b1',
     'lent', ' Paul ', 50000, '2026-09-05',
     '00000000-0000-0000-0000-0000000004d1', '2026-10-15')),
  'Paul',
  'Alice prête 50 000 à Paul ; le nom est rogné'
);

select public.create_debt(
  '00000000-0000-0000-0000-0000000004c2', '00000000-0000-0000-0000-0000000004b1',
  'borrowed', 'Awa', 20000, '2026-09-06',
  '00000000-0000-0000-0000-0000000004d2', null, 'Pour la rentrée');

SELECT results_eq(
  $$select type::text, amount, note, category_id is null
      from public.transactions where id = '00000000-0000-0000-0000-0000000004d1'$$,
  $$values ('expense', 50000.00::numeric(12,2), 'Prêt à Paul', true)$$,
  'Prêter crée une sortie sans catégorie, titrée du nom'
);

SELECT results_eq(
  $$select type::text, note from public.transactions where id = '00000000-0000-0000-0000-0000000004d2'$$,
  $$values ('income', 'Emprunt à Awa')$$,
  'Emprunter crée une entrée'
);

SELECT is(
  (select id from public.create_debt(
     '00000000-0000-0000-0000-0000000004c1', '00000000-0000-0000-0000-0000000004b1',
     'lent', 'Paul', 50000, '2026-09-05',
     '00000000-0000-0000-0000-0000000004d9')),
  '00000000-0000-0000-0000-0000000004c1'::uuid,
  'Renvoyer la même création rend la dette existante'
);

SELECT is(
  (select count(*)::int from public.transactions where debt_id = '00000000-0000-0000-0000-0000000004c1'),
  1,
  'Sans second mouvement'
);

-- ---------------------------------------------------------------------------
-- Bob, autre membre, reçoit un remboursement partiel de Paul
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000004a2","role":"authenticated"}', true);

SELECT results_eq(
  $$select type::text, amount, note from public.record_debt_payment(
      '00000000-0000-0000-0000-0000000004c1', 15000, '2026-09-20',
      '00000000-0000-0000-0000-0000000004e1')$$,
  $$values ('income', 15000.00::numeric(12,2), 'Remboursement de Paul')$$,
  'Un remboursement reçu est une entrée'
);

SELECT is(
  (select id from public.record_debt_payment(
     '00000000-0000-0000-0000-0000000004c1', 15000, '2026-09-20',
     '00000000-0000-0000-0000-0000000004e1')),
  '00000000-0000-0000-0000-0000000004e1'::uuid,
  'Renvoyer le même remboursement rend le mouvement existant, sans doublon'
);

SELECT throws_ok(
  $$select public.record_debt_payment(
      '00000000-0000-0000-0000-0000000004c1', 35001, '2026-09-21',
      '00000000-0000-0000-0000-0000000004e2')$$,
  'P0001',
  'Le remboursement dépasse ce qui reste dû.',
  'Un remboursement au-delà du reste est refusé'
);

SELECT throws_ok(
  $$select public.record_debt_payment(
      '00000000-0000-0000-0000-0000000004c1', 10.5, '2026-09-21',
      '00000000-0000-0000-0000-0000000004e3')$$,
  'P0001',
  'Indiquez un montant entier, supérieur à zéro.',
  'Un montant avec des décimales est refusé'
);

SELECT results_eq(
  $$select counterparty, paid, remaining from public.debts_overview('00000000-0000-0000-0000-0000000004b1')
     order by counterparty$$,
  $$values ('Awa', 0::numeric, 20000.00::numeric), ('Paul', 15000.00::numeric, 35000.00::numeric)$$,
  'Le reste dû se calcule en base à partir des remboursements'
);

SELECT results_eq(
  $$select owed_to_us, we_owe, open_count from public.debts_totals('00000000-0000-0000-0000-0000000004b1')$$,
  $$values (35000.00::numeric, 20000.00::numeric, 2)$$,
  'Les restes dus s''additionnent par sens'
);

-- ---------------------------------------------------------------------------
-- Totaux
-- ---------------------------------------------------------------------------

-- Hors dettes : 200 000 d'entrées, 30 000 de sorties. Dettes : +20 000 (emprunt) + 15 000 (remboursement reçu) − 50 000 (prêt) = −15 000. Solde : 200 000 − 30 000 − 15 000 = 155 000.
SELECT results_eq(
  $$select income, expense, savings, debts, balance, tx_count
      from public.period_summary('00000000-0000-0000-0000-0000000004b1', '2026-09-01', '2026-10-01')$$,
  $$values (200000.00::numeric, 30000.00::numeric, 0::numeric, -15000.00::numeric, 155000.00::numeric, 5)$$,
  'Les prêts et dettes sont hors des entrées et sorties, sur leur ligne, et comptés dans le solde'
);

SELECT results_eq(
  $$select income, expense, savings, debts, balance, tx_count
      from public.filtered_totals('00000000-0000-0000-0000-0000000004b1', '2026-09-01', '2026-10-01')$$,
  $$select income, expense, savings, debts, balance, tx_count
      from public.period_summary('00000000-0000-0000-0000-0000000004b1', '2026-09-01', '2026-10-01')$$,
  'Le relevé donne les mêmes totaux que le tableau de bord'
);

SELECT is(
  (select coalesce(sum(total), 0) from public.category_breakdown('00000000-0000-0000-0000-0000000004b1', '2026-09-01', '2026-10-01')),
  30000.00::numeric,
  'La répartition par catégorie ignore les prêts et dettes'
);

-- ---------------------------------------------------------------------------
-- Le client ne touche aux mouvements que par les fonctions
-- ---------------------------------------------------------------------------

SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, type, amount, debt_id)
    values ('00000000-0000-0000-0000-0000000004b1', '00000000-0000-0000-0000-0000000004a2', 'income', 1000,
            '00000000-0000-0000-0000-0000000004c1')$$,
  '42501',
  NULL,
  'Le client ne crée pas de mouvement de dette directement'
);

SELECT throws_ok(
  $$update public.transactions set amount = 1 where id = '00000000-0000-0000-0000-0000000004e1'$$,
  'P0001',
  'Un mouvement de prêt ou de dette se gère depuis l''écran Prêts et dettes, pas depuis l''historique.',
  'Un mouvement de dette ne se modifie pas depuis l''historique'
);

SELECT throws_ok(
  $$update public.debts set amount = 1 where id = '00000000-0000-0000-0000-0000000004c1'$$,
  '42501',
  NULL,
  'Le montant d''une dette ne se réécrit pas'
);

SELECT lives_ok(
  $$update public.debts set counterparty = 'Paul N.', due_on = '2026-11-01' where id = '00000000-0000-0000-0000-0000000004c1'$$,
  'Le nom et l''échéance se corrigent'
);

-- ---------------------------------------------------------------------------
-- Eve, hors du groupe
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000004a3","role":"authenticated"}', true);

SELECT throws_ok(
  $$select public.create_debt(
      '00000000-0000-0000-0000-0000000004c3', '00000000-0000-0000-0000-0000000004b1',
      'lent', 'X', 1000, '2026-09-10', '00000000-0000-0000-0000-0000000004d3')$$,
  'P0001',
  'Vous n''avez pas accès à ce budget.',
  'Un non-membre ne crée pas de dette dans le groupe'
);

SELECT throws_ok(
  $$select public.record_debt_payment(
      '00000000-0000-0000-0000-0000000004c1', 1000, '2026-09-10', '00000000-0000-0000-0000-0000000004e4')$$,
  'P0001',
  'Cette dette n''existe plus.',
  'Un non-membre ne rembourse pas une dette du groupe, malgré SECURITY DEFINER'
);

-- ---------------------------------------------------------------------------
-- Supprimer une dette retire ses mouvements du solde
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000004a1","role":"authenticated"}', true);

delete from public.debts where id = '00000000-0000-0000-0000-0000000004c1';

SELECT is(
  (select debts from public.period_summary('00000000-0000-0000-0000-0000000004b1', '2026-09-01', '2026-10-01')),
  20000.00::numeric,
  'Supprimer le prêt à Paul emporte ses deux mouvements ; seul l''emprunt à Awa reste'
);

SELECT * FROM finish();
ROLLBACK;
