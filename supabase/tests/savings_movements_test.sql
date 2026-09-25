-- Versements d'épargne enregistrés comme opérations du compte personnel, et totaux qui les séparent des dépenses (migration savings_movements).
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(17);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000002a1', 'alice-s@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000002a2', 'bob-s@example.com',   '{"display_name": "Bob"}'::jsonb);

-- Famille : Alice et Bob. Sert à vérifier qu'un versement n'y apparaît jamais.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000002b1', 'Famille', '00000000-0000-0000-0000-0000000002a1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000002b1', '00000000-0000-0000-0000-0000000002a1', 'owner'),
  ('00000000-0000-0000-0000-0000000002b1', '00000000-0000-0000-0000-0000000002a2', 'member');

insert into public.savings_goals (id, user_id, name, target_amount, current_amount) values
  ('00000000-0000-0000-0000-0000000002c1', '00000000-0000-0000-0000-0000000002a1', 'Moto', 500000, 0);

create temporary table s_personal as
select g.id from public.budget_groups g
 where g.owner_id = '00000000-0000-0000-0000-0000000002a1' and g.is_personal;
grant select on s_personal to authenticated;

-- Un salaire de 200 000 et une dépense de 30 000 dans le compte personnel d'Alice, en septembre.
insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on)
select id, '00000000-0000-0000-0000-0000000002a1'::uuid,
       (select c.id from public.categories c where c.group_id is null and c.name = 'Salaire'), 'income'::public.transaction_type, 200000, '2026-09-05'
  from s_personal
union all
select id, '00000000-0000-0000-0000-0000000002a1'::uuid,
       (select c.id from public.categories c where c.group_id is null and c.name = 'Alimentation'), 'expense'::public.transaction_type, 30000, '2026-09-06'::date
  from s_personal;

-- ---------------------------------------------------------------------------
-- Versement et retrait, en tant qu'Alice
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated"}', true);

select public.add_to_savings_goal('00000000-0000-0000-0000-0000000002c1', 50000, '2026-09-10');
select public.add_to_savings_goal('00000000-0000-0000-0000-0000000002c1', -10000, '2026-09-20');

SELECT is(
  (select current_amount from public.savings_goals where id = '00000000-0000-0000-0000-0000000002c1'),
  40000.00::numeric(12,2),
  'Le montant de l''objectif suit le versement et le retrait'
);

SELECT results_eq(
  $$select type::text, amount, occurred_on, note, is_savings, savings_goal_id, category_id is null
      from public.transactions
     where savings_goal_id = '00000000-0000-0000-0000-0000000002c1'
     order by occurred_on$$,
  $$values
      ('expense', 50000.00::numeric(12,2), '2026-09-10'::date, 'Moto', true, '00000000-0000-0000-0000-0000000002c1'::uuid, true),
      ('income',  10000.00::numeric(12,2), '2026-09-20'::date, 'Moto', true, '00000000-0000-0000-0000-0000000002c1'::uuid, true)$$,
  'Un versement devient une sortie, un retrait une entrée, datés du jour de l''appareil et titrés du nom de l''objectif'
);

SELECT is(
  (select count(*)::int from public.transactions
    where savings_goal_id = '00000000-0000-0000-0000-0000000002c1'
      and group_id = (select id from s_personal)),
  2,
  'Les opérations d''épargne vont dans le compte personnel'
);

SELECT is(
  (select count(*)::int from public.transactions
    where group_id = '00000000-0000-0000-0000-0000000002b1'),
  0,
  'Aucune opération d''épargne n''apparaît dans le budget partagé'
);

-- ---------------------------------------------------------------------------
-- Totaux
-- ---------------------------------------------------------------------------

-- Entrées 200 000 et sorties 30 000 hors épargne ; épargne nette 50 000 − 10 000 = 40 000 ; solde 200 000 − 30 000 − 40 000 = 130 000.
SELECT results_eq(
  $$select income, expense, savings, balance, tx_count
      from public.period_summary((select id from s_personal), '2026-09-01', '2026-10-01')$$,
  $$values (200000.00::numeric, 30000.00::numeric, 40000.00::numeric, 130000.00::numeric, 4)$$,
  'Le résumé de période sépare l''épargne des entrées et des sorties, et le solde la déduit'
);

SELECT results_eq(
  $$select income, expense, savings, balance, tx_count
      from public.filtered_totals((select id from s_personal), '2026-09-01', '2026-10-01')$$,
  $$select income, expense, savings, balance, tx_count
      from public.period_summary((select id from s_personal), '2026-09-01', '2026-10-01')$$,
  'Le relevé exporté donne les mêmes totaux que le tableau de bord'
);

SELECT is(
  (select coalesce(sum(total), 0) from public.category_breakdown((select id from s_personal), '2026-09-01', '2026-10-01')),
  30000.00::numeric,
  'La répartition par catégorie ignore l''épargne'
);

SELECT is(
  (select count(*)::int from public.frequent_amounts((select id from s_personal), 'expense')
    where amount = 50000),
  0,
  'Un versement d''épargne ne devient pas un montant proposé à la saisie'
);

-- ---------------------------------------------------------------------------
-- Le client ne crée, ne modifie ni ne supprime une opération d'épargne lui-même
-- ---------------------------------------------------------------------------

SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, type, amount, is_savings)
    values ((select id from s_personal), '00000000-0000-0000-0000-0000000002a1', 'expense', 1000, true)$$,
  '42501',
  NULL,
  'Le client ne peut pas créer d''opération d''épargne directement'
);

SELECT throws_ok(
  $$update public.transactions set amount = 1
     where savings_goal_id = '00000000-0000-0000-0000-0000000002c1' and type = 'expense'$$,
  'P0001',
  'Un versement d''épargne se gère depuis son objectif, pas depuis l''historique.',
  'Le montant d''une opération d''épargne ne se modifie pas depuis l''historique'
);

SELECT throws_ok(
  $$delete from public.transactions
     where savings_goal_id = '00000000-0000-0000-0000-0000000002c1' and type = 'expense'$$,
  'P0001',
  'Un versement d''épargne se gère depuis son objectif, pas depuis l''historique.',
  'Une opération d''épargne ne se supprime pas depuis l''historique'
);

SELECT lives_ok(
  $$update public.transactions set note = 'Courses du mois'
     where group_id = (select id from s_personal) and type = 'expense' and not is_savings$$,
  'Une opération ordinaire se modifie toujours'
);

-- ---------------------------------------------------------------------------
-- Bob : ni l'objectif d'Alice, ni son compte personnel
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000002a2","role":"authenticated"}', true);

SELECT throws_ok(
  $$select public.add_to_savings_goal('00000000-0000-0000-0000-0000000002c1', 1000)$$,
  'P0001',
  'Cet objectif n''existe plus.',
  'Un autre utilisateur ne peut pas verser sur l''objectif d''Alice, malgré SECURITY DEFINER'
);

-- ---------------------------------------------------------------------------
-- Suppression de l'objectif : l'épargne reste de l'épargne
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated"}', true);

SELECT lives_ok(
  $$delete from public.savings_goals where id = '00000000-0000-0000-0000-0000000002c1'$$,
  'Un objectif qui a des versements se supprime'
);

SELECT is(
  (select count(*)::int from public.transactions
    where group_id = (select id from s_personal) and is_savings and savings_goal_id is null),
  2,
  'Ses opérations restent, marquées comme épargne, sans objectif'
);

SELECT is(
  (select savings from public.period_summary((select id from s_personal), '2026-09-01', '2026-10-01')),
  40000.00::numeric,
  'Supprimer l''objectif ne rend pas l''argent au solde et ne change pas les totaux'
);

-- ---------------------------------------------------------------------------
-- Suppression du compte : la cascade passe malgré la garde
-- ---------------------------------------------------------------------------

set local role postgres;

SELECT lives_ok(
  $$delete from auth.users where id = '00000000-0000-0000-0000-0000000002a1'$$,
  'La suppression du compte emporte les opérations d''épargne'
);

SELECT * FROM finish();
ROLLBACK;
