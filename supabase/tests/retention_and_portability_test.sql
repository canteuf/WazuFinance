-- Conservation et portabilité (migration 20260929000200_retention_and_portability.sql) : registre des comptes supprimés, mesures d'usage, purges, export complet.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(23);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000ae1', 'awa-p@example.com',    '{"display_name": "Awa"}'::jsonb),
  ('00000000-0000-0000-0000-000000000ae2', 'bintou-p@example.com', '{"display_name": "Bintou"}'::jsonb),
  ('00000000-0000-0000-0000-000000000ae3', 'chantal-p@example.com', '{"display_name": "Chantal"}'::jsonb);

-- Un budget partagé entre Awa (propriétaire) et Bintou.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-000000000ac1', 'Famille', '00000000-0000-0000-0000-000000000ae1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000ac1', '00000000-0000-0000-0000-000000000ae1', 'owner'),
  ('00000000-0000-0000-0000-000000000ac1', '00000000-0000-0000-0000-000000000ae2', 'member');

-- Awa : une opération dans son compte personnel, une dans le groupe. Bintou : une dans le groupe.
insert into public.transactions (id, group_id, user_id, type, amount, occurred_on, note) values
  ('00000000-0000-0000-0000-000000000ad1',
   (select g.id from public.budget_groups g where g.owner_id = '00000000-0000-0000-0000-000000000ae1' and g.is_personal),
   '00000000-0000-0000-0000-000000000ae1', 'expense', 1500, '2026-09-20', 'Marché'),
  ('00000000-0000-0000-0000-000000000ad2', '00000000-0000-0000-0000-000000000ac1',
   '00000000-0000-0000-0000-000000000ae1', 'expense', 2500, '2026-09-21', 'Loyer'),
  ('00000000-0000-0000-0000-000000000ad3', '00000000-0000-0000-0000-000000000ac1',
   '00000000-0000-0000-0000-000000000ae2', 'expense', 900, '2026-09-22', 'Taxi de Bintou');

insert into public.savings_goals (id, user_id, name, target_amount)
values ('00000000-0000-0000-0000-000000000af1', '00000000-0000-0000-0000-000000000ae1', 'Moto', 400000);

-- ---------------------------------------------------------------------------
-- Aucun accès client aux nouvelles tables
-- ---------------------------------------------------------------------------

SELECT ok(
  not has_table_privilege('authenticated', 'public.product_events', 'select')
  and not has_table_privilege('authenticated', 'public.product_events', 'insert'),
  'Les clients ne lisent ni n''écrivent product_events directement'
);

SELECT ok(
  not has_table_privilege('authenticated', 'public.account_deletions', 'select'),
  'Les clients ne lisent pas le registre des suppressions'
);

SELECT ok(
  not has_function_privilege('authenticated', 'public.purge_expired_data()', 'execute'),
  'Les clients ne lancent pas la purge'
);

-- ---------------------------------------------------------------------------
-- Mesures d'usage
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000ae1","role":"authenticated","email":"awa-p@example.com"}', true);

SELECT lives_ok($$select public.log_product_event('app_opened')$$, 'Un compte enregistre son ouverture du jour');
SELECT lives_ok($$select public.log_product_event('app_opened')$$, 'La même ouverture, répétée, ne lève rien');
SELECT lives_ok($$select public.log_product_event('invite_shared')$$, 'Un partage d''invitation s''enregistre');

SELECT throws_ok(
  $$select public.log_product_event('transaction_amount_5000')$$,
  '23514',
  NULL,
  'Un événement hors de la liste est refusé'
);

set local role postgres;

SELECT is(
  (select count(*)::integer from public.product_events where user_id = '00000000-0000-0000-0000-000000000ae1'),
  2,
  'Une ligne par événement et par jour, pas une par appel'
);

-- ---------------------------------------------------------------------------
-- Export complet
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000ae1","role":"authenticated","email":"awa-p@example.com"}', true);

SELECT is(
  public.export_my_data() -> 'account' ->> 'email',
  'awa-p@example.com',
  'L''export donne l''email du compte'
);

SELECT is(
  jsonb_array_length(public.export_my_data() -> 'groups'),
  2,
  'L''export liste le compte personnel et le budget partagé'
);

SELECT is(
  (select array_agg(value ->> 'id' order by value ->> 'id')
     from jsonb_array_elements(public.export_my_data() -> 'transactions')),
  array['00000000-0000-0000-0000-000000000ad1', '00000000-0000-0000-0000-000000000ad2'],
  'L''export contient les opérations saisies par Awa, pas celles de Bintou'
);

SELECT is(
  public.export_my_data() -> 'savings_goals' -> 0 ->> 'name',
  'Moto',
  'L''export contient ses objectifs d''épargne'
);

SELECT is(
  jsonb_array_length(public.export_my_data() -> 'wallets'),
  1,
  'L''export contient le portefeuille par défaut du compte personnel'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000ae2","role":"authenticated","email":"bintou-p@example.com"}', true);

SELECT is(
  (select array_agg(value ->> 'id')
     from jsonb_array_elements(public.export_my_data() -> 'transactions')),
  array['00000000-0000-0000-0000-000000000ad3'],
  'L''export de Bintou ne contient que sa propre saisie'
);

SELECT is(
  jsonb_array_length(public.export_my_data() -> 'savings_goals'),
  0,
  'Ni les objectifs d''épargne d''Awa'
);

-- ---------------------------------------------------------------------------
-- Registre des comptes supprimés
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000ae3","role":"authenticated"}', true);

SELECT lives_ok($$select public.delete_own_account()$$, 'Chantal supprime son compte');

set local role postgres;

SELECT is(
  (select count(*)::integer from public.account_deletions where user_id = '00000000-0000-0000-0000-000000000ae3'),
  1,
  'La suppression est consignée dans le registre'
);

-- ---------------------------------------------------------------------------
-- Purges
-- ---------------------------------------------------------------------------

-- Des lignes vieillies artificiellement, à côté de lignes récentes.
insert into public.invitation_attempts (user_id, attempted_at) values
  ('00000000-0000-0000-0000-000000000ae1', now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000ae1', now());

insert into public.product_events (user_id, event, occurred_on)
values ('00000000-0000-0000-0000-000000000ae1', 'app_opened', current_date - interval '14 months');

insert into public.activity_log (group_id, subject, subject_id, action, old_values, changed_fields, occurred_at) values
  ('00000000-0000-0000-0000-000000000ac1', 'transaction', '00000000-0000-0000-0000-000000000ad2', 'update', '{}'::jsonb, '{}', now() - interval '25 months'),
  ('00000000-0000-0000-0000-000000000ac1', 'transaction', '00000000-0000-0000-0000-000000000ad2', 'update', '{}'::jsonb, '{}', now() - interval '23 months');

update public.account_deletions set deleted_at = now() - interval '36 days'
 where user_id = '00000000-0000-0000-0000-000000000ae3';

select public.purge_expired_data();

SELECT is(
  (select count(*)::integer from public.invitation_attempts where user_id = '00000000-0000-0000-0000-000000000ae1'),
  1,
  'Les tentatives de code de plus d''un jour sont purgées, pas les récentes'
);

SELECT is(
  (select count(*)::integer from public.product_events where user_id = '00000000-0000-0000-0000-000000000ae1'),
  2,
  'Les mesures de plus de 13 mois sont purgées, pas celles du jour'
);

SELECT is(
  (select count(*)::integer from public.activity_log
    where group_id = '00000000-0000-0000-0000-000000000ac1' and occurred_at < now() - interval '24 months'),
  0,
  'Le journal perd ses entrées de plus de 24 mois'
);

SELECT is(
  (select count(*)::integer from public.activity_log
    where group_id = '00000000-0000-0000-0000-000000000ac1' and occurred_at < now() - interval '22 months'),
  1,
  'Il garde celles de 23 mois'
);

SELECT is(
  (select count(*)::integer from public.account_deletions where user_id = '00000000-0000-0000-0000-000000000ae3'),
  0,
  'Le registre oublie une suppression après 35 jours'
);

SELECT is(
  (select count(*)::integer from cron.job where jobname = 'purge-expired-data'),
  1,
  'La purge est planifiée chaque nuit'
);

SELECT * FROM finish();
ROLLBACK;
