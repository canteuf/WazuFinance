-- Gestion des catégories (20260930000100_category_management.sql).
--
-- A prouver : category_usage() compte opérations, budgets et modèles récurrents des seules catégories du groupe, et rien pour un non-membre ; delete_category() reporte les opérations (y compris un encaissement de vente à crédit, que guard_debt_movement protège au niveau 1) et les modèles récurrents sur la remplaçante, supprime le budget de la catégorie, refuse une remplaçante d'un autre type ou d'un autre groupe sans rien toucher, refuse une catégorie par défaut et un lecteur, laisse les opérations sans catégorie sans remplaçante, et ne fait rien pour une catégorie déjà supprimée.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(19);

-- ---------------------------------------------------------------------------
-- Fixtures, creees en tant que postgres (RLS contournee)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000009a1', 'alice@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000009a2', 'bob@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000009a3', 'carol@example.com', '{"display_name": "Carol"}'::jsonb),
  ('00000000-0000-0000-0000-0000000009a4', 'dave@example.com',  '{"display_name": "Dave"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal) values
  ('00000000-0000-0000-0000-0000000009b1', 'Famille', '00000000-0000-0000-0000-0000000009a1', false),
  ('00000000-0000-0000-0000-0000000009b2', 'Autre',   '00000000-0000-0000-0000-0000000009a4', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000009b1', '00000000-0000-0000-0000-0000000009a1', 'owner'),
  ('00000000-0000-0000-0000-0000000009b1', '00000000-0000-0000-0000-0000000009a2', 'member'),
  ('00000000-0000-0000-0000-0000000009b1', '00000000-0000-0000-0000-0000000009a3', 'viewer'),
  ('00000000-0000-0000-0000-0000000009b2', '00000000-0000-0000-0000-0000000009a4', 'owner');

insert into public.categories (id, group_id, name, icon, type) values
  ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009b1', 'Animaux', 'paw', 'expense'),
  ('00000000-0000-0000-0000-0000000009c2', '00000000-0000-0000-0000-0000000009b1', 'Sport', 'dumbbell', 'expense'),
  ('00000000-0000-0000-0000-0000000009c3', '00000000-0000-0000-0000-0000000009b1', 'Prime', 'briefcase-outline', 'income'),
  ('00000000-0000-0000-0000-0000000009c4', '00000000-0000-0000-0000-0000000009b2', 'Jeux', 'gamepad-variant-outline', 'expense'),
  ('00000000-0000-0000-0000-0000000009c5', '00000000-0000-0000-0000-0000000009b1', 'Ventes', 'shopping-outline', 'income'),
  ('00000000-0000-0000-0000-0000000009c6', '00000000-0000-0000-0000-0000000009b1', 'Vide', 'tag-outline', 'expense');

-- Deux opérations « Animaux », de deux membres différents, un modèle récurrent et un budget.
insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on) values
  ('00000000-0000-0000-0000-0000000009d1', '00000000-0000-0000-0000-0000000009b1', '00000000-0000-0000-0000-0000000009a1',
   '00000000-0000-0000-0000-0000000009c1', 'expense', 2000, '2026-09-10'),
  ('00000000-0000-0000-0000-0000000009d2', '00000000-0000-0000-0000-0000000009b1', '00000000-0000-0000-0000-0000000009a2',
   '00000000-0000-0000-0000-0000000009c1', 'expense', 3000, '2026-09-11'),
  ('00000000-0000-0000-0000-0000000009d3', '00000000-0000-0000-0000-0000000009b1', '00000000-0000-0000-0000-0000000009a1',
   '00000000-0000-0000-0000-0000000009c2', 'expense', 1500, '2026-09-12');

insert into public.recurring_transactions (id, group_id, user_id, category_id, type, amount, frequency, anchor_day, next_due_on)
values ('00000000-0000-0000-0000-0000000009e1', '00000000-0000-0000-0000-0000000009b1', '00000000-0000-0000-0000-0000000009a1',
        '00000000-0000-0000-0000-0000000009c1', 'expense', 2000, 'monthly', 5, '2026-10-05');

insert into public.budgets (id, group_id, category_id, amount)
values ('00000000-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009b1',
        '00000000-0000-0000-0000-0000000009c1', 10000);

-- Un encaissement de vente à crédit, rangé dans une catégorie de revenu du groupe : guard_debt_movement refuse de le modifier depuis l'historique.
insert into public.debts (id, group_id, user_id, direction, counterparty, amount)
values ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-0000000009b1',
        '00000000-0000-0000-0000-0000000009a1', 'credit_sale', 'Mama Rose', 5000);

insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on, debt_id)
values ('00000000-0000-0000-0000-0000000009d4', '00000000-0000-0000-0000-0000000009b1', '00000000-0000-0000-0000-0000000009a1',
        '00000000-0000-0000-0000-0000000009c5', 'income', 2000, '2026-09-13', '00000000-0000-0000-0000-000000000901');

create temp table default_ids on commit drop as
select
  (select id from public.categories where group_id is null and name = 'Divers') as divers,
  (select id from public.categories where group_id is null and name = 'Autres revenus') as autres_revenus;
grant select on default_ids to authenticated;

-- ---------------------------------------------------------------------------
-- category_usage()
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009a2","role":"authenticated"}', true);

SELECT results_eq(
  $$select transactions, budgets, recurring from public.category_usage('00000000-0000-0000-0000-0000000009b1')
    where category_id = '00000000-0000-0000-0000-0000000009c1'$$,
  $$values (2::bigint, 1::bigint, 1::bigint)$$,
  'category_usage compte operations, budgets et modeles recurrents'
);

SELECT is(
  (select count(*)::int from public.category_usage('00000000-0000-0000-0000-0000000009b1')),
  5,
  'category_usage ne rend que les categories du groupe, pas celles par defaut'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009a4","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.category_usage('00000000-0000-0000-0000-0000000009b1')),
  0,
  'Un non-membre ne recoit rien'
);

-- ---------------------------------------------------------------------------
-- Refus
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009a2","role":"authenticated"}', true);

SELECT throws_ok(
  $$select public.delete_category('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009c3')$$,
  'P0001',
  'Choisissez une autre catégorie du même type, dans ce budget.',
  'Une remplacante d''un autre type est refusee'
);

SELECT throws_ok(
  $$select public.delete_category('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009c4')$$,
  'P0001',
  'Choisissez une autre catégorie du même type, dans ce budget.',
  'Une remplacante d''un autre groupe est refusee'
);

SELECT throws_ok(
  $$select public.delete_category('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009c1')$$,
  'P0001',
  'Choisissez une autre catégorie du même type, dans ce budget.',
  'La categorie ne se remplace pas par elle-meme'
);

SELECT is(
  (select count(*)::int from public.transactions where category_id = '00000000-0000-0000-0000-0000000009c1'),
  2,
  'Un refus ne touche a aucune operation'
);

SELECT throws_ok(
  $$select public.delete_category((select divers from default_ids))$$,
  'P0001',
  'Les catégories par défaut ne se suppriment pas.',
  'Une categorie par defaut ne se supprime pas'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009a3","role":"authenticated"}', true);

SELECT throws_ok(
  $$select public.delete_category('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009c2')$$,
  'P0001',
  'Vous êtes lecteur de ce budget : vous pouvez tout consulter, mais pas modifier.',
  'Un lecteur ne supprime pas de categorie'
);

-- Un non-membre ne voit pas la catégorie : rien n'est supprimé, sans erreur.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009a4","role":"authenticated"}', true);

select public.delete_category('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009c2');

reset role;

SELECT ok(
  exists (select 1 from public.categories where id = '00000000-0000-0000-0000-0000000009c1'),
  'Un non-membre ne supprime rien'
);

-- ---------------------------------------------------------------------------
-- Suppression avec report, par Bob (simple membre)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009a2","role":"authenticated"}', true);

SELECT lives_ok(
  $$select public.delete_category('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009c2')$$,
  'Un membre supprime une categorie en reportant ses operations'
);

reset role;

SELECT is(
  (select count(*)::int from public.transactions where category_id = '00000000-0000-0000-0000-0000000009c2'),
  3,
  'Les operations des deux membres sont reportees sur la remplacante'
);

SELECT is(
  (select category_id from public.recurring_transactions where id = '00000000-0000-0000-0000-0000000009e1'),
  '00000000-0000-0000-0000-0000000009c2'::uuid,
  'Le modele recurrent est reporte aussi'
);

SELECT ok(
  not exists (select 1 from public.budgets where id = '00000000-0000-0000-0000-0000000009f1'),
  'Le budget de la categorie supprimee part avec elle'
);

SELECT is(
  current_setting('wazu.category_replacement', true),
  '',
  'Le reglage de report est efface apres la suppression'
);

-- ---------------------------------------------------------------------------
-- Encaissement de vente à crédit, vers une catégorie par défaut
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}', true);

SELECT lives_ok(
  $$select public.delete_category('00000000-0000-0000-0000-0000000009c5', (select autres_revenus from default_ids))$$,
  'Un encaissement de vente a credit est reporte malgre guard_debt_movement'
);

reset role;

SELECT is(
  (select category_id from public.transactions where id = '00000000-0000-0000-0000-0000000009d4'),
  (select autres_revenus from default_ids),
  'L''encaissement porte la categorie par defaut choisie'
);

-- ---------------------------------------------------------------------------
-- Sans remplaçante, et rejeu
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}', true);

SELECT lives_ok(
  $$select public.delete_category('00000000-0000-0000-0000-0000000009c6')$$,
  'Une categorie inutilisee se supprime sans remplacante'
);

SELECT lives_ok(
  $$select public.delete_category('00000000-0000-0000-0000-0000000009c6')$$,
  'Supprimer une categorie deja supprimee ne fait rien'
);

SELECT * FROM finish();
ROLLBACK;
