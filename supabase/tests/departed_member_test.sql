-- Un compte supprimé laisse son historique dans les groupes qui lui survivent (migration 20260926000200_departed_member_history.sql), et la suppression complète d'un groupe emporte tout ce qu'il contient.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(24);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001e1', 'alice-d@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000001e2', 'bob-d@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000001e3', 'carol-d@example.com', '{"display_name": "Carol"}'::jsonb);

-- Tontine : Alice propriétaire, Bob et Carol membres.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000001c1', 'Tontine', '00000000-0000-0000-0000-0000000001e1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000001e1', 'owner'),
  ('00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000001e2', 'member'),
  ('00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000001e3', 'member');

-- Un second portefeuille, pour le transfert.
insert into public.wallets (id, group_id, name, kind)
values ('00000000-0000-0000-0000-0000000001f2', '00000000-0000-0000-0000-0000000001c1', 'MoMo', 'mobile_money');

-- Une opération ordinaire saisie par Bob, datée d'hier pour que « modifié » se voie si updated_at bougeait.
insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-0000000001c1',
   '00000000-0000-0000-0000-0000000001e2',
   (select id from public.categories where group_id is null and name = 'Tontine'),
   'expense', 5000, '2026-09-10', now() - interval '1 day', now() - interval '1 day');

-- Bob saisit un prêt, un transfert avec frais et une récurrence ; Alice enregistre un remboursement du prêt de Bob.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000001e2","role":"authenticated"}', true);

select public.create_debt(
  '00000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-0000000001c1', 'lent',
  'Cousin', 10000, '2026-09-11', '00000000-0000-0000-0000-0000000001d2'
);

select public.transfer_between_wallets(
  '00000000-0000-0000-0000-0000000001a2',
  (select id from public.wallets where group_id = '00000000-0000-0000-0000-0000000001c1' and is_default),
  '00000000-0000-0000-0000-0000000001f2',
  3000, '2026-09-12', '00000000-0000-0000-0000-0000000001d3', 100
);

insert into public.recurring_transactions (id, group_id, user_id, type, amount, frequency, anchor_day, next_due_on)
values ('00000000-0000-0000-0000-0000000001a3', '00000000-0000-0000-0000-0000000001c1',
        '00000000-0000-0000-0000-0000000001e2', 'expense', 2000, 'monthly', 5, '2026-10-05');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000001e1","role":"authenticated"}', true);

select public.record_debt_payment(
  '00000000-0000-0000-0000-0000000001a1', 4000, '2026-09-13', '00000000-0000-0000-0000-0000000001d4'
);

-- ---------------------------------------------------------------------------
-- Les emails ne se lisent plus entre membres (20260926000300_hide_member_emails.sql)
-- ---------------------------------------------------------------------------

SELECT is(
  (select display_name from public.users where id = '00000000-0000-0000-0000-0000000001e2'),
  'Bob',
  'Un membre lit toujours le nom d''un autre membre'
);

SELECT throws_ok(
  $$select email from public.users where id = '00000000-0000-0000-0000-0000000001e2'$$,
  '42501',
  NULL,
  'Mais plus son email'
);

SELECT throws_ok(
  $$select email from public.users where id = '00000000-0000-0000-0000-0000000001e1'$$,
  '42501',
  NULL,
  'Ni le sien par la table : il vient de la session'
);

-- ---------------------------------------------------------------------------
-- Un client ne fait pas passer un auteur pour parti
-- ---------------------------------------------------------------------------

-- Bob existe encore : effacer l'auteur de sa ligne serait une réattribution, que guard_immutable_columns() refuse.
SELECT throws_ok(
  $$update public.transactions set user_id = null
     where id = '00000000-0000-0000-0000-0000000001d1'$$,
  '42501',
  'Colonne user_id non modifiable',
  'Un membre ne peut pas effacer l''auteur d''une opération'
);

SELECT throws_ok(
  $$update public.transactions set author_name = 'Personne'
     where id = '00000000-0000-0000-0000-0000000001d1'$$,
  '42501',
  NULL,
  'Ni écrire le nom figé d''un auteur'
);

-- ---------------------------------------------------------------------------
-- Bob supprime son compte
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000001e2","role":"authenticated"}', true);

-- Échouait avant la migration : guard_debt_movement() refusait la suppression directe du prêt de Bob.
SELECT lives_ok(
  $$select public.delete_own_account()$$,
  'Un membre qui a saisi un prêt et un transfert supprime son compte'
);

set local role postgres;

SELECT is(
  (select count(*)::integer from auth.users where id = '00000000-0000-0000-0000-0000000001e2'),
  0,
  'Le compte est supprimé'
);

SELECT is(
  (select user_id from public.transactions where id = '00000000-0000-0000-0000-0000000001d1'),
  NULL,
  'Son opération reste, sans auteur'
);

SELECT is(
  (select author_name from public.transactions where id = '00000000-0000-0000-0000-0000000001d1'),
  'Bob',
  'Elle garde son nom'
);

SELECT ok(
  (select updated_at = created_at from public.transactions where id = '00000000-0000-0000-0000-0000000001d1'),
  'Le départ ne la marque pas « modifiée »'
);

SELECT is(
  (select count(*)::integer from public.activity_log where group_id = '00000000-0000-0000-0000-0000000001c1'),
  0,
  'Le départ n''écrit rien au journal'
);

SELECT is(
  (select author_name from public.debts where id = '00000000-0000-0000-0000-0000000001a1'),
  'Bob',
  'Le prêt reste, au nom de Bob'
);

SELECT is(
  (select count(*)::integer from public.transactions where debt_id = '00000000-0000-0000-0000-0000000001a1'),
  2,
  'Le prêt garde ses deux mouvements, dont le remboursement saisi par Alice'
);

SELECT is(
  (select user_id from public.transactions where id = '00000000-0000-0000-0000-0000000001d4'),
  '00000000-0000-0000-0000-0000000001e1'::uuid,
  'Le remboursement d''Alice garde son auteur'
);

SELECT is(
  (select remaining from public.debts_overview('00000000-0000-0000-0000-0000000001c1')
    where id = '00000000-0000-0000-0000-0000000001a1'),
  6000::numeric,
  'Ce qui reste dû ne change pas'
);

SELECT is(
  (select author_name from public.wallet_transfers where id = '00000000-0000-0000-0000-0000000001a2'),
  'Bob',
  'Le transfert reste, au nom de Bob'
);

SELECT is(
  (select author_name from public.transactions where id = '00000000-0000-0000-0000-0000000001d3'),
  'Bob',
  'Ses frais de transfert aussi'
);

SELECT is(
  (select author_name from public.recurring_transactions where id = '00000000-0000-0000-0000-0000000001a3'),
  'Bob',
  'La récurrence reste proposée au groupe'
);

SELECT is(
  (select count(*)::integer from public.budget_groups
    where owner_id = '00000000-0000-0000-0000-0000000001e2'),
  0,
  'Son compte personnel est parti entier'
);

-- ---------------------------------------------------------------------------
-- Les autres membres voient toujours la caisse
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000001e3","role":"authenticated"}', true);

SELECT is(
  (select count(*)::integer from public.transactions where group_id = '00000000-0000-0000-0000-0000000001c1'),
  4,
  'Carol voit les quatre opérations du groupe'
);

SELECT is(
  (select balance from public.period_summary('00000000-0000-0000-0000-0000000001c1', '2026-09-01', '2026-10-01')),
  (-5000 - 10000 + 4000 - 100)::numeric,
  'Le solde du groupe est celui d''avant le départ'
);

-- ---------------------------------------------------------------------------
-- Suppression complète d'un groupe
-- ---------------------------------------------------------------------------

set local role postgres;

SELECT lives_ok(
  $$delete from public.budget_groups where id = '00000000-0000-0000-0000-0000000001c1'$$,
  'Un groupe avec dettes, transferts, portefeuilles et récurrences se supprime'
);

SELECT is(
  (select count(*)::integer from public.transactions where group_id = '00000000-0000-0000-0000-0000000001c1')
    + (select count(*)::integer from public.debts where group_id = '00000000-0000-0000-0000-0000000001c1')
    + (select count(*)::integer from public.wallet_transfers where group_id = '00000000-0000-0000-0000-0000000001c1')
    + (select count(*)::integer from public.wallets where group_id = '00000000-0000-0000-0000-0000000001c1')
    + (select count(*)::integer from public.recurring_transactions where group_id = '00000000-0000-0000-0000-0000000001c1'),
  0,
  'Rien du groupe ne reste'
);

SELECT is(
  (select count(*)::integer from public.activity_log where group_id = '00000000-0000-0000-0000-0000000001c1'),
  0,
  'Ni son journal'
);

SELECT * FROM finish();
ROLLBACK;
