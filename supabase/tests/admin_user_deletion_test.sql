-- Suppression d'un compte par l'API d'administration de Supabase Auth, celle du tableau de bord (20261011000100_admin_user_deletion.sql).
--
-- A prouver : supprimer depuis le tableau de bord un utilisateur membre d'un budget partagé passe, sous le rôle supabase_auth_admin qu'utilise Supabase Auth ; ses codes d'invitation actifs sont révoqués comme pour une exclusion ; le groupe partagé reste aux autres membres.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(4);

-- ---------------------------------------------------------------------------
-- Fixtures, creees en tant que postgres (RLS contournee)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000fa01', 'alice@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-00000000fa02', 'bob@example.com',   '{"display_name": "Bob"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal) values
  ('00000000-0000-0000-0000-00000000fb01', 'Duo', '00000000-0000-0000-0000-00000000fa01', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa01', 'owner'),
  ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa02', 'member');

insert into public.group_invitations (id, group_id, created_by, role) values
  ('00000000-0000-0000-0000-00000000fc01', '00000000-0000-0000-0000-00000000fb01',
   '00000000-0000-0000-0000-00000000fa01', 'viewer');

-- ---------------------------------------------------------------------------
-- Suppression de Bob depuis le tableau de bord
-- ---------------------------------------------------------------------------

-- Supabase Auth supprime le compte sous le rôle supabase_auth_admin, sans claims JWT (auth.uid() vaut NULL). La cascade efface le profil puis l'adhésion de Bob, et les triggers AFTER de l'adhésion s'exécutent sous ce même rôle, qui n'a aucun droit sur les tables de public. postgres ne peut pas emprunter supabase_auth_admin : un rôle de test qui n'a que le droit d'effacer le profil reproduit la même cascade, un niveau plus bas.
create role wazu_test_auth_admin nologin;
grant wazu_test_auth_admin to postgres;
grant usage on schema public, extensions to wazu_test_auth_admin;
grant select, delete on public.users to wazu_test_auth_admin;
create policy users_test_auth_admin on public.users to wazu_test_auth_admin using (true);

set local role wazu_test_auth_admin;
select set_config('request.jwt.claims', '', true);

SELECT lives_ok(
  $$delete from public.users where id = '00000000-0000-0000-0000-00000000fa02'$$,
  'un role sans droit sur group_invitations supprime Bob, membre d''un budget partage, comme Supabase Auth'
);

set local role postgres;

SELECT ok(
  (select prosecdef from pg_proc where oid = 'public.revoke_invitations_on_member_change'::regproc),
  'revoke_invitations_on_member_change() s''execute avec les droits de son proprietaire'
);

SELECT isnt(
  (select revoked_at from public.group_invitations where id = '00000000-0000-0000-0000-00000000fc01'),
  null,
  'le code actif du groupe est revoque, comme pour une exclusion'
);

SELECT is(
  (select count(*)::int from public.budget_groups where id = '00000000-0000-0000-0000-00000000fb01'),
  1,
  'Duo reste a Alice'
);

SELECT * FROM finish();
ROLLBACK;
