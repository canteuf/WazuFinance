-- Durcissement du lot 1 (migration 20260929000100_invitation_and_replay_hardening.sql) : codes d'invitation cachés aux lecteurs, révocation à l'exclusion et à la rétrogradation, rejeu borné au groupe de l'appelant, longueur des textes libres.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(19);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000009e1', 'awa-h@example.com',    '{"display_name": "Awa"}'::jsonb),
  ('00000000-0000-0000-0000-0000000009e2', 'bintou-h@example.com', '{"display_name": "Bintou"}'::jsonb),
  ('00000000-0000-0000-0000-0000000009e3', 'chantal-h@example.com', '{"display_name": "Chantal"}'::jsonb),
  ('00000000-0000-0000-0000-0000000009e4', 'dora-h@example.com',   '{"display_name": "Dora"}'::jsonb);

-- Awa propriétaire, Bintou membre, Chantal lectrice, Dora membre (elle sera exclue).
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000009c1', 'Tontine', '00000000-0000-0000-0000-0000000009e1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009e1', 'owner'),
  ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009e2', 'member'),
  ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009e3', 'viewer'),
  ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009e4', 'member');

insert into public.group_invitations (id, group_id, code, created_by, expires_at, role) values
  ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009c1', 'MEMBRE22', '00000000-0000-0000-0000-0000000009e1', now() + interval '7 days', 'member'),
  ('00000000-0000-0000-0000-0000000009a2', '00000000-0000-0000-0000-0000000009c1', 'LECTEUR3', '00000000-0000-0000-0000-0000000009e1', now() + interval '7 days', 'viewer');

-- Une dette et un transfert de Dora, pour le rejeu après son exclusion.
insert into public.debts (id, group_id, user_id, direction, counterparty, amount)
values ('00000000-0000-0000-0000-0000000009d1', '00000000-0000-0000-0000-0000000009c1',
        '00000000-0000-0000-0000-0000000009e4', 'credit_sale', 'Mama Ngo', 20000);

insert into public.wallets (id, group_id, name, kind)
values ('00000000-0000-0000-0000-0000000009b2', '00000000-0000-0000-0000-0000000009c1', 'MoMo', 'mobile_money');

insert into public.wallet_transfers (id, group_id, user_id, from_wallet_id, to_wallet_id, amount, occurred_on)
values ('00000000-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009c1',
        '00000000-0000-0000-0000-0000000009e4',
        (select id from public.wallets where group_id = '00000000-0000-0000-0000-0000000009c1' and is_default),
        '00000000-0000-0000-0000-0000000009b2', 5000, '2026-09-28');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Les lecteurs ne lisent pas les codes
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009e3","role":"authenticated"}', true);

SELECT is(
  (select count(*)::integer from public.group_invitations where group_id = '00000000-0000-0000-0000-0000000009c1'),
  0,
  'Une lectrice ne lit aucun code d''invitation'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009e2","role":"authenticated"}', true);

SELECT is(
  (select count(*)::integer from public.group_invitations where group_id = '00000000-0000-0000-0000-0000000009c1'),
  2,
  'Un membre lit toujours les codes, pour inviter ses proches'
);

-- ---------------------------------------------------------------------------
-- Un départ volontaire ne révoque rien
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009e3","role":"authenticated"}', true);

delete from public.account_memberships
 where group_id = '00000000-0000-0000-0000-0000000009c1'
   and user_id = '00000000-0000-0000-0000-0000000009e3';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009e1","role":"authenticated"}', true);

SELECT is(
  (select count(*)::integer from public.group_invitations
    where group_id = '00000000-0000-0000-0000-0000000009c1' and revoked_at is null),
  2,
  'Quitter le groupe laisse les codes actifs'
);

-- ---------------------------------------------------------------------------
-- Rétrograder un membre révoque les codes « membre »
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009e1","role":"authenticated"}', true);

select public.set_member_role('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009e2', 'viewer');

set local role postgres;

SELECT isnt(
  (select revoked_at from public.group_invitations where id = '00000000-0000-0000-0000-0000000009a1'),
  NULL,
  'Rendre lecteur révoque le code « membre » qu''il a vu'
);

SELECT is(
  (select revoked_at from public.group_invitations where id = '00000000-0000-0000-0000-0000000009a2'),
  NULL,
  'Le code « lecteur » reste actif'
);

-- Même avec un code « membre » en main, la rétrogradée ne remonte pas en quittant puis revenant : ce code est révoqué.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009e2","role":"authenticated"}', true);

delete from public.account_memberships
 where group_id = '00000000-0000-0000-0000-0000000009c1'
   and user_id = '00000000-0000-0000-0000-0000000009e2';

SELECT is(
  public.join_group_with_code('MEMBRE22'),
  NULL,
  'Le code « membre » révoqué ne fait plus entrer'
);

-- ---------------------------------------------------------------------------
-- Exclure révoque tous les codes actifs
-- ---------------------------------------------------------------------------

set local role postgres;
insert into public.group_invitations (id, group_id, code, created_by, expires_at, role)
values ('00000000-0000-0000-0000-0000000009a3', '00000000-0000-0000-0000-0000000009c1', 'MEMBRE33', '00000000-0000-0000-0000-0000000009e1', now() + interval '7 days', 'member');
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009e1","role":"authenticated"}', true);

SELECT lives_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000009c1'
       and user_id = '00000000-0000-0000-0000-0000000009e4'$$,
  'La propriétaire exclut Dora'
);

SELECT is(
  (select count(*)::integer from public.group_invitations
    where group_id = '00000000-0000-0000-0000-0000000009c1' and revoked_at is null),
  0,
  'L''exclusion révoque tous les codes actifs du groupe'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009e4","role":"authenticated"}', true);

SELECT is(
  public.join_group_with_code('MEMBRE33'),
  NULL,
  'La personne exclue ne revient pas avec le code qu''elle connaissait'
);

-- ---------------------------------------------------------------------------
-- Rejeu : rien d'un groupe dont l'appelant n'est plus membre
-- ---------------------------------------------------------------------------

SELECT throws_ok(
  $$select public.create_debt('00000000-0000-0000-0000-0000000009d1', '00000000-0000-0000-0000-0000000009c1',
      'credit_sale', 'Mama Ngo', 20000, '2026-09-28', gen_random_uuid())$$,
  'P0001',
  'Vous n''avez pas accès à ce budget.',
  'create_debt ne relit pas la dette d''un groupe quitté'
);

SELECT throws_ok(
  $$select public.record_debt_payment('00000000-0000-0000-0000-0000000009d1', 1000, '2026-09-28', gen_random_uuid())$$,
  'P0001',
  'Cette dette n''existe plus.',
  'record_debt_payment non plus'
);

SELECT throws_ok(
  $$select public.transfer_between_wallets('00000000-0000-0000-0000-0000000009f1',
      (select id from public.wallets where group_id = '00000000-0000-0000-0000-0000000009c1' and is_default),
      '00000000-0000-0000-0000-0000000009b2', 5000, '2026-09-28', gen_random_uuid())$$,
  'P0001',
  'Ce portefeuille n''existe plus.',
  'transfer_between_wallets ne relit pas un transfert d''un groupe quitté'
);

-- Le rejeu d'un membre reste idempotent.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000009e1","role":"authenticated"}', true);

SELECT is(
  (public.create_debt('00000000-0000-0000-0000-0000000009d1', '00000000-0000-0000-0000-0000000009c1',
      'credit_sale', 'Mama Ngo', 20000, '2026-09-28', gen_random_uuid())).id,
  '00000000-0000-0000-0000-0000000009d1'::uuid,
  'Un membre qui rejoue create_debt retrouve la dette existante'
);

SELECT is(
  (public.record_debt_payment('00000000-0000-0000-0000-0000000009d1', 1000, '2026-09-28', '00000000-0000-0000-0000-000000000901')).amount,
  1000::numeric(12, 2),
  'Un versement passe'
);

SELECT is(
  (public.record_debt_payment('00000000-0000-0000-0000-0000000009d1', 1000, '2026-09-28', '00000000-0000-0000-0000-000000000901')).id,
  '00000000-0000-0000-0000-000000000901'::uuid,
  'Le même versement rejoué renvoie la ligne existante'
);

SELECT is(
  (select count(*)::integer from public.transactions where debt_id = '00000000-0000-0000-0000-0000000009d1'),
  1,
  'Et ne compte qu''une fois'
);

-- ---------------------------------------------------------------------------
-- Longueur des textes libres
-- ---------------------------------------------------------------------------

SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, type, amount, occurred_on, note)
    values ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009e1', 'expense', 100, '2026-09-28', repeat('x', 121))$$,
  '23514',
  NULL,
  'Une note d''opération dépasse 120 caractères : refusée'
);

SELECT lives_ok(
  $$insert into public.transactions (group_id, user_id, type, amount, occurred_on, note)
    values ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009e1', 'expense', 100, '2026-09-28', repeat('x', 120))$$,
  '120 caractères passent'
);

SELECT throws_ok(
  $$update public.users set display_name = repeat('x', 65) where id = '00000000-0000-0000-0000-0000000009e1'$$,
  '23514',
  NULL,
  'Un nom affiché de plus de 64 caractères est refusé'
);

SELECT * FROM finish();
ROLLBACK;
