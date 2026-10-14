-- Aperçu d'une invitation avant de rejoindre (20261014000100_invitation_preview.sql).
--
-- À prouver : un code valide montre le groupe, son propriétaire et le rôle sans faire entrer ; un code inconnu ne montre rien et compte comme une tentative ; la limite d'essais est partagée avec join_group_with_code().
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000cc01', 'alice-p@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-00000000cc02', 'bob-p@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-00000000cc03', 'carol-p@example.com', '{"display_name": "Carol"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal) values
  ('00000000-0000-0000-0000-00000000cd01', 'Tontine du quartier', '00000000-0000-0000-0000-00000000cc01', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000cd01', '00000000-0000-0000-0000-00000000cc01', 'owner'),
  ('00000000-0000-0000-0000-00000000cd01', '00000000-0000-0000-0000-00000000cc03', 'viewer');

insert into public.group_invitations (id, group_id, created_by, role, code) values
  ('00000000-0000-0000-0000-00000000ce01', '00000000-0000-0000-0000-00000000cd01', '00000000-0000-0000-0000-00000000cc01', 'viewer', 'PREVIEW2');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc02","role":"authenticated"}', true);

SELECT results_eq(
  $$select group_name, owner_name, member_count, role::text, already_member from public.preview_invitation('prev-iew2')$$,
  $$values ('Tontine du quartier'::text, 'Alice'::text, 2, 'viewer'::text, false)$$,
  'un code valide montre le groupe, son propriétaire, ses membres et le rôle offert'
);

SELECT is(
  (select count(*)::int from public.account_memberships where group_id = '00000000-0000-0000-0000-00000000cd01' and user_id = '00000000-0000-0000-0000-00000000cc02'),
  0,
  'l''aperçu ne fait pas entrer dans le groupe'
);

SELECT is(
  (select count(*)::int from public.preview_invitation('ZZZZZZZZ')),
  0,
  'un code inconnu ne montre rien'
);

set local role postgres;
SELECT is(
  (select count(*)::int from public.invitation_attempts where user_id = '00000000-0000-0000-0000-00000000cc02'),
  1,
  'un code inconnu compte comme une tentative, un code valide non'
);

-- Neuf erreurs de plus : la dixième est atteinte, l'aperçu comme l'entrée sont refusés.
insert into public.invitation_attempts (user_id)
select '00000000-0000-0000-0000-00000000cc02' from generate_series(1, 9);
set local role authenticated;

SELECT throws_ok(
  $$select * from public.preview_invitation('PREVIEW2')$$,
  'P0001', 'Trop de codes erronés. Réessayez dans une heure.',
  'la limite d''essais vaut pour l''aperçu'
);

SELECT throws_ok(
  $$select public.join_group_with_code('PREVIEW2')$$,
  'P0001', 'Trop de codes erronés. Réessayez dans une heure.',
  'et elle est partagée avec join_group_with_code()'
);

-- Carol, déjà membre, voit qu'elle l'est.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc03","role":"authenticated"}', true);

SELECT is(
  (select already_member from public.preview_invitation('PREVIEW2')),
  true,
  'un membre qui rouvre le lien est prévenu qu''il est déjà dans le groupe'
);

set local role postgres;
update public.group_invitations set revoked_at = now() where id = '00000000-0000-0000-0000-00000000ce01';
set local role authenticated;

SELECT is(
  (select count(*)::int from public.preview_invitation('PREVIEW2')),
  0,
  'un code révoqué ne montre plus rien'
);

SELECT * FROM finish();
ROLLBACK;
