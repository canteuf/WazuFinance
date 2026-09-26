-- Journal complet : créations, dettes, portefeuilles, transferts, adhésions ; noms des anciens membres (migration 20260927000300_full_activity_log.sql).
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004e1', 'awa-l@example.com',   '{"display_name": "Awa"}'::jsonb),
  ('00000000-0000-0000-0000-0000000004e2', 'bintou-l@example.com', '{"display_name": "Bintou"}'::jsonb);

-- Le groupe d'Awa, créé comme le fait create_shared_group() : le groupe, puis l'adhésion de sa propriétaire. Awa invite ensuite Bintou.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000004c1', 'Caisse', '00000000-0000-0000-0000-0000000004e1', false);

insert into public.account_memberships (group_id, user_id, role)
values ('00000000-0000-0000-0000-0000000004c1', '00000000-0000-0000-0000-0000000004e1', 'owner');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000004e1","role":"authenticated"}', true);

SELECT is(
  (select count(*)::integer from public.activity_log where group_id = '00000000-0000-0000-0000-0000000004c1'::uuid and subject = 'membership'),
  0,
  'La création du groupe ne journalise pas l''adhésion de sa propriétaire'
);

-- Code fixe, posé en postgres : Bintou le réutilisera après son exclusion, quand elle ne pourra plus lire les invitations du groupe.
set local role postgres;
insert into public.group_invitations (group_id, code, created_by, expires_at)
values ('00000000-0000-0000-0000-0000000004c1', 'CAISSE42', '00000000-0000-0000-0000-0000000004e1', now() + interval '7 days');
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000004e2","role":"authenticated"}', true);

select public.join_group_with_code('CAISSE42');

SELECT is(
  (select actor_name from public.activity_log
    where group_id = '00000000-0000-0000-0000-0000000004c1'::uuid and subject = 'membership' and action = 'insert'),
  'Bintou',
  'Une arrivée est journalisée, au nom de qui arrive'
);

-- Bintou saisit une dépense, un prêt, puis Awa enregistre un remboursement.
insert into public.transactions (id, group_id, user_id, type, amount, occurred_on)
values ('00000000-0000-0000-0000-0000000004d1', '00000000-0000-0000-0000-0000000004c1'::uuid,
        '00000000-0000-0000-0000-0000000004e2', 'expense', 3000, '2026-09-20');

SELECT is(
  (select new_values ->> 'amount' from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000004d1' and action = 'insert'),
  '3000.00',
  'Une création d''opération est journalisée avec ses valeurs'
);

SELECT is(
  (select old_values from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000004d1' and action = 'insert'),
  NULL,
  'Une création n''a pas de valeurs d''avant'
);

select public.create_debt('00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004c1'::uuid,
  'lent', 'Cousin', 10000, '2026-09-20', '00000000-0000-0000-0000-0000000004d2');

SELECT is(
  (select count(*)::integer from public.activity_log where subject = 'debt' and subject_id = '00000000-0000-0000-0000-0000000004a1'),
  1,
  'La création d''un prêt est journalisée'
);

SELECT is(
  (select count(*)::integer from public.activity_log where subject_id = '00000000-0000-0000-0000-0000000004d2'),
  0,
  'Son mouvement de départ ne l''est pas une seconde fois'
);

-- now() est figé pour toute la transaction du test : sans ce recul, le remboursement semblerait écrit dans la même transaction que la dette, et serait pris pour son mouvement de départ.
set local role postgres;
update public.debts set created_at = now() - interval '1 day' where id = '00000000-0000-0000-0000-0000000004a1';
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000004e1","role":"authenticated"}', true);

select public.record_debt_payment('00000000-0000-0000-0000-0000000004a1', 4000, '2026-09-21', '00000000-0000-0000-0000-0000000004d3');

SELECT is(
  (select actor_name from public.activity_log where subject_id = '00000000-0000-0000-0000-0000000004d3' and action = 'insert'),
  'Awa',
  'Un remboursement est journalisé'
);

-- Portefeuille et transfert.
insert into public.wallets (id, group_id, name, kind)
values ('00000000-0000-0000-0000-0000000004f1', '00000000-0000-0000-0000-0000000004c1'::uuid, 'MoMo', 'mobile_money');

SELECT is(
  (select count(*)::integer from public.activity_log where subject = 'wallet' and subject_id = '00000000-0000-0000-0000-0000000004f1'),
  1,
  'La création d''un portefeuille est journalisée'
);

select public.transfer_between_wallets('00000000-0000-0000-0000-0000000004a2',
  (select id from public.wallets where group_id = '00000000-0000-0000-0000-0000000004c1'::uuid and is_default),
  '00000000-0000-0000-0000-0000000004f1', 2000, '2026-09-21', '00000000-0000-0000-0000-0000000004d4');

SELECT is(
  (select (new_values ->> 'amount')::numeric from public.activity_log where subject = 'transfer'),
  2000::numeric,
  'Un transfert est journalisé'
);

-- Changement de rôle.
select public.set_member_role('00000000-0000-0000-0000-0000000004c1'::uuid, '00000000-0000-0000-0000-0000000004e2', 'viewer');

SELECT is(
  (select changed_fields from public.activity_log
    where group_id = '00000000-0000-0000-0000-0000000004c1'::uuid and subject = 'membership' and action = 'update'),
  array['role']::text[],
  'Un changement de rôle est journalisé'
);

-- Un compte personnel ne journalise pas ses créations.
insert into public.transactions (id, group_id, user_id, type, amount, occurred_on)
values ('00000000-0000-0000-0000-0000000004d5',
        (select id from public.budget_groups where owner_id = '00000000-0000-0000-0000-0000000004e1' and is_personal),
        '00000000-0000-0000-0000-0000000004e1', 'expense', 500, '2026-09-21');

SELECT is(
  (select count(*)::integer from public.activity_log where subject_id = '00000000-0000-0000-0000-0000000004d5'),
  0,
  'Une saisie dans un compte personnel n''est pas journalisée'
);

-- ---------------------------------------------------------------------------
-- Anciens membres
-- ---------------------------------------------------------------------------

-- Awa exclut Bintou.
delete from public.account_memberships
 where group_id = '00000000-0000-0000-0000-0000000004c1'::uuid and user_id = '00000000-0000-0000-0000-0000000004e2';

SELECT is(
  (select display_name from public.former_members
    where group_id = '00000000-0000-0000-0000-0000000004c1'::uuid and user_id = '00000000-0000-0000-0000-0000000004e2'),
  'Bintou',
  'Le nom d''un membre parti reste lisible par le groupe'
);

SELECT is(
  (select count(*)::integer from public.activity_log
    where group_id = '00000000-0000-0000-0000-0000000004c1'::uuid and subject = 'membership' and action = 'delete'),
  1,
  'Son départ est journalisé'
);

SELECT throws_ok(
  $$insert into public.former_members (group_id, user_id, display_name)
    values ('00000000-0000-0000-0000-0000000004c1'::uuid, '00000000-0000-0000-0000-0000000004e1', 'Faux')$$,
  '42501',
  NULL,
  'Un client n''écrit pas dans former_members'
);

-- Bintou revient avec le même code : elle n'est plus une ancienne membre.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000004e2","role":"authenticated"}', true);

select public.join_group_with_code('CAISSE42');

SELECT is(
  (select count(*)::integer from public.former_members where group_id = '00000000-0000-0000-0000-0000000004c1'::uuid),
  0,
  'Revenir dans le groupe efface la trace d''ancien membre'
);

-- Bintou quitte en supprimant son compte : son nom est retenu quand même.
select public.delete_own_account();

set local role postgres;

SELECT is(
  (select display_name from public.former_members
    where group_id = '00000000-0000-0000-0000-0000000004c1'::uuid and user_id = '00000000-0000-0000-0000-0000000004e2'),
  'Bintou',
  'Un compte supprimé laisse son nom au groupe'
);

SELECT * FROM finish();
ROLLBACK;
