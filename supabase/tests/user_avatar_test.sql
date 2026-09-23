-- Avatar du profil : format contraint, écriture limitée à sa propre ligne, lecture par les membres d'un même groupe.
--
-- Voir supabase/migrations/20260921000100_user_avatar.sql.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(11);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'alice-v@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f2', 'bob-v@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f3', 'carol-v@example.com', '{"display_name": "Carol"}'::jsonb);

-- Coloc : Alice et Bob. Carol n'y est pas.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000f9', 'Coloc', '00000000-0000-0000-0000-0000000000f1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000f1', 'owner'),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000f2', 'member');

-- Le trigger handle_new_user() ne connaît pas la colonne : un compte neuf n'a pas d'avatar, et l'app affiche l'initiale.
SELECT is(
  (select avatar from public.users where id = '00000000-0000-0000-0000-0000000000f1'),
  NULL,
  'Un compte neuf n''a pas d''avatar'
);

-- ---------------------------------------------------------------------------
-- Alice écrit son propre avatar
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

SELECT lives_ok(
  $$update public.users set avatar = 'a03'
     where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'Un utilisateur choisit son avatar'
);

SELECT is(
  (select avatar from public.users where id = '00000000-0000-0000-0000-0000000000f1'),
  'a03',
  'L''avatar est enregistré'
);

-- La contrainte de format refuse ce qui n'est pas une lettre suivie de deux chiffres, avant que la valeur n'atteigne les autres membres.
SELECT throws_ok(
  $$update public.users set avatar = 'x1'
     where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '23514',
  NULL,
  'Un identifiant mal formé est refusé'
);

SELECT throws_ok(
  $$update public.users set avatar = 'a3'
     where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '23514',
  NULL,
  'Un seul chiffre est refusé'
);

-- Revenir aux initiales : NULL est une valeur légitime, pas une violation de la contrainte.
SELECT lives_ok(
  $$update public.users set avatar = NULL
     where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'Un utilisateur revient aux initiales'
);

SELECT is(
  (select avatar from public.users where id = '00000000-0000-0000-0000-0000000000f1'),
  NULL,
  'Et l''avatar est bien effacé'
);

-- ---------------------------------------------------------------------------
-- Alice vise l'avatar de Bob
-- ---------------------------------------------------------------------------

-- La policy users_update_self filtre la ligne : l'update ne touche rien plutôt que d'échouer. On vérifie la valeur après coup, pas le nombre de lignes.
SELECT lives_ok(
  $$update public.users set avatar = 'a09'
     where id = '00000000-0000-0000-0000-0000000000f2'$$,
  'Viser l''avatar d''un autre ne lève pas d''erreur'
);

SELECT is(
  (select avatar from public.users where id = '00000000-0000-0000-0000-0000000000f2'),
  NULL,
  'Mais ne change rien : la policy a filtré la ligne'
);

-- ---------------------------------------------------------------------------
-- Qui lit l'avatar d'Alice
-- ---------------------------------------------------------------------------

update public.users set avatar = 'a05'
 where id = '00000000-0000-0000-0000-0000000000f1';

-- Bob partage Coloc avec Alice : users_select_self_or_covisible lui montre sa ligne, avatar compris. C'est ce qui affiche les visages sur les piles de membres.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);

SELECT is(
  (select avatar from public.users where id = '00000000-0000-0000-0000-0000000000f1'),
  'a05',
  'Un membre du même groupe lit l''avatar'
);

-- Carol ne partage aucun groupe avec Alice : la ligne entière lui est invisible.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);

SELECT is(
  (select count(*)::integer from public.users
    where id = '00000000-0000-0000-0000-0000000000f1'),
  0,
  'Un étranger ne voit ni la ligne ni l''avatar'
);

SELECT * FROM finish();
ROLLBACK;
