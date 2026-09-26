-- Rôles dans les groupes partagés : lecteur, rôle choisi à l'invitation, changement de rôle, passation de propriété (migration 20260927000200_group_roles.sql).
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(26);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000003e1', 'awa-r@example.com',   '{"display_name": "Awa"}'::jsonb),
  ('00000000-0000-0000-0000-0000000003e2', 'bintou-r@example.com', '{"display_name": "Bintou"}'::jsonb),
  ('00000000-0000-0000-0000-0000000003e3', 'chantal-r@example.com', '{"display_name": "Chantal"}'::jsonb);

-- Tontine : Awa propriétaire (la trésorière), Bintou membre. Chantal rejoindra en lectrice.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000003c1', 'Tontine', '00000000-0000-0000-0000-0000000003e1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003e1', 'owner'),
  ('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003e2', 'member');

insert into public.transactions (id, group_id, user_id, type, amount, occurred_on)
values ('00000000-0000-0000-0000-0000000003d1', '00000000-0000-0000-0000-0000000003c1',
        '00000000-0000-0000-0000-0000000003e1', 'income', 5000, '2026-09-20');

insert into public.budgets (id, group_id, category_id, amount)
values ('00000000-0000-0000-0000-0000000003b1', '00000000-0000-0000-0000-0000000003c1',
        (select id from public.categories where group_id is null and name = 'Alimentation'), 10000);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Invitation en lecteur
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000003e1","role":"authenticated"}', true);

SELECT lives_ok(
  $$insert into public.group_invitations (group_id, created_by, role)
    values ('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003e1', 'viewer')$$,
  'La propriétaire crée une invitation en lecteur'
);

-- Le code tiré par la base n'est lisible que des membres : Chantal, pas encore membre, reçoit ici un code fixe, posé en postgres.
set local role postgres;
insert into public.group_invitations (group_id, code, created_by, expires_at, role)
values ('00000000-0000-0000-0000-0000000003c1', 'LECTEUR2', '00000000-0000-0000-0000-0000000003e1', now() + interval '7 days', 'viewer');
set local role authenticated;

SELECT throws_ok(
  $$insert into public.group_invitations (group_id, created_by, role)
    values ('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003e1', 'owner')$$,
  '23514',
  NULL,
  'Une invitation ne fait pas entrer en propriétaire'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000003e3","role":"authenticated"}', true);

SELECT is(
  public.join_group_with_code('LECTEUR2'),
  '00000000-0000-0000-0000-0000000003c1'::uuid,
  'Chantal rejoint avec le code lecteur'
);

SELECT is(
  (select role::text from public.account_memberships
    where group_id = '00000000-0000-0000-0000-0000000003c1' and user_id = '00000000-0000-0000-0000-0000000003e3'),
  'viewer',
  'Elle entre avec le rôle que porte l''invitation'
);

-- ---------------------------------------------------------------------------
-- Le lecteur voit tout et ne modifie rien
-- ---------------------------------------------------------------------------

SELECT is(
  (select count(*)::integer from public.transactions where group_id = '00000000-0000-0000-0000-0000000003c1'),
  1,
  'Une lectrice voit les opérations du groupe'
);

SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, type, amount, occurred_on)
    values ('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003e3', 'expense', 100, '2026-09-21')$$,
  'P0001',
  'Vous êtes lecteur de ce budget : vous pouvez tout consulter, mais pas modifier.',
  'Une lectrice ne saisit pas d''opération'
);

SELECT throws_ok(
  $$update public.transactions set amount = 1 where id = '00000000-0000-0000-0000-0000000003d1'$$,
  'P0001',
  'Vous êtes lecteur de ce budget : vous pouvez tout consulter, mais pas modifier.',
  'Ni ne modifie celle d''un autre'
);

SELECT throws_ok(
  $$delete from public.transactions where id = '00000000-0000-0000-0000-0000000003d1'$$,
  'P0001',
  'Vous êtes lecteur de ce budget : vous pouvez tout consulter, mais pas modifier.',
  'Ni ne la supprime'
);

-- create_debt() est SECURITY DEFINER et contourne RLS : le trigger la couvre quand même.
SELECT throws_ok(
  $$select public.create_debt('00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-0000000003c1',
      'lent', 'Cousin', 1000, '2026-09-21', '00000000-0000-0000-0000-0000000003a2')$$,
  'P0001',
  'Vous êtes lecteur de ce budget : vous pouvez tout consulter, mais pas modifier.',
  'Ni ne crée de prêt, même par une fonction qui contourne RLS'
);

SELECT throws_ok(
  $$select public.adjust_budget_amount('00000000-0000-0000-0000-0000000003b1', 500)$$,
  'P0001',
  NULL,
  'Ni n''ajuste un plafond'
);

SELECT throws_ok(
  $$insert into public.wallets (group_id, name) values ('00000000-0000-0000-0000-0000000003c1', 'Caisse')$$,
  'P0001',
  'Vous êtes lecteur de ce budget : vous pouvez tout consulter, mais pas modifier.',
  'Ni ne crée de portefeuille'
);

SELECT throws_ok(
  $$insert into public.categories (group_id, name, icon, type) values ('00000000-0000-0000-0000-0000000003c1', 'Cotisation', 'cash', 'income')$$,
  'P0001',
  'Vous êtes lecteur de ce budget : vous pouvez tout consulter, mais pas modifier.',
  'Ni ne crée de catégorie'
);

-- Ses propres comptes lui restent : le rôle ne vaut que dans ce groupe.
SELECT lives_ok(
  $$insert into public.transactions (group_id, user_id, type, amount, occurred_on)
    values ((select id from public.budget_groups where owner_id = '00000000-0000-0000-0000-0000000003e3' and is_personal),
            '00000000-0000-0000-0000-0000000003e3', 'expense', 100, '2026-09-21')$$,
  'Elle saisit toujours dans son compte personnel'
);

-- ---------------------------------------------------------------------------
-- Changer le rôle d'un membre
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000003e2","role":"authenticated"}', true);

SELECT throws_ok(
  $$select public.set_member_role('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003e3', 'member')$$,
  'P0001',
  'Seul le propriétaire du groupe peut changer les rôles.',
  'Un simple membre ne change pas les rôles'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000003e1","role":"authenticated"}', true);

SELECT throws_ok(
  $$select public.set_member_role('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003e3', 'owner')$$,
  'P0001',
  'Pour confier le groupe à un membre, utilisez « Passer la main ».',
  'Le changement de rôle ne fait pas de propriétaire'
);

SELECT lives_ok(
  $$select public.set_member_role('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003e2', 'viewer')$$,
  'La propriétaire passe Bintou en lectrice'
);

SELECT is(
  (select role::text from public.account_memberships
    where group_id = '00000000-0000-0000-0000-0000000003c1' and user_id = '00000000-0000-0000-0000-0000000003e2'),
  'viewer',
  'Le rôle est changé'
);

SELECT throws_ok(
  $$update public.account_memberships set role = 'owner'
     where group_id = '00000000-0000-0000-0000-0000000003c1' and user_id = '00000000-0000-0000-0000-0000000003e2'$$,
  '42501',
  NULL,
  'Aucun rôle ne se change par un update direct'
);

-- ---------------------------------------------------------------------------
-- Passer la main
-- ---------------------------------------------------------------------------

-- Avant : la propriétaire d'un groupe peuplé ne pouvait pas partir.
SELECT throws_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000003c1' and user_id = '00000000-0000-0000-0000-0000000003e1'$$,
  'P0001',
  'Le propriétaire ne peut pas quitter un groupe qui a d''autres membres',
  'La propriétaire ne quitte pas un groupe peuplé'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000003e2","role":"authenticated"}', true);

SELECT throws_ok(
  $$select public.transfer_ownership('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003e2')$$,
  'P0001',
  'Seul le propriétaire du groupe peut passer la main.',
  'Un membre ne se donne pas le groupe'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000003e1","role":"authenticated"}', true);

SELECT lives_ok(
  $$select public.transfer_ownership('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003e3')$$,
  'Awa passe la main à Chantal, lectrice jusque-là'
);

SELECT results_eq(
  $$select user_id::text, role::text from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000003c1' order by user_id$$,
  $$values ('00000000-0000-0000-0000-0000000003e1', 'member'),
           ('00000000-0000-0000-0000-0000000003e2', 'viewer'),
           ('00000000-0000-0000-0000-0000000003e3', 'owner')$$,
  'Chantal est propriétaire, Awa membre, un seul propriétaire'
);

set local role postgres;

SELECT is(
  (select owner_id from public.budget_groups where id = '00000000-0000-0000-0000-0000000003c1'),
  '00000000-0000-0000-0000-0000000003e3'::uuid,
  'owner_id suit : la suppression du compte d''Awa n''emportera plus le groupe'
);

set local role authenticated;

SELECT lives_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000003c1' and user_id = '00000000-0000-0000-0000-0000000003e1'$$,
  'Awa, simple membre désormais, peut partir'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000003e3","role":"authenticated"}', true);

SELECT throws_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000003c1' and user_id = '00000000-0000-0000-0000-0000000003e3'$$,
  'P0001',
  'Le propriétaire ne peut pas quitter un groupe qui a d''autres membres',
  'La nouvelle propriétaire ne laisse pas le groupe sans propriétaire'
);

SELECT lives_ok(
  $$insert into public.transactions (group_id, user_id, type, amount, occurred_on)
    values ('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003e3', 'income', 2000, '2026-09-22')$$,
  'Devenue propriétaire, elle saisit dans le groupe'
);

SELECT * FROM finish();
ROLLBACK;
