-- Paramètres du compte (écran 8) : privilèges par colonne, suppression de son propre compte, et refus de rejoindre un groupe sans propriétaire.
--
-- Voir docs/superpowers/specs/2026-09-13-parametres-compte-design.md.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(22);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'alice-a@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e2', 'bob-a@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e3', 'carol-a@example.com', '{"display_name": "Carol"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e4', 'dora-a@example.com',  '{"display_name": "Dora"}'::jsonb);

-- Coloc : Alice propriétaire, Bob membre. Bloque la suppression du compte d'Alice.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000c1', 'Coloc', '00000000-0000-0000-0000-0000000000e1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'owner'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e2', 'member');

-- Solo : Carol propriétaire et seule membre. Ne bloque rien.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000c2', 'Solo', '00000000-0000-0000-0000-0000000000e3', false);

insert into public.account_memberships (group_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e3', 'owner');

-- Une opération de Bob et une d'Alice dans Coloc : à la suppression du compte de Bob, la sienne part et celle d'Alice reste.
insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000e2',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 12.00, '2026-09-10'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000e1',
   (select id from public.categories where group_id is null and name = 'Transport'),
   'expense', 34.00, '2026-09-11');

-- ---------------------------------------------------------------------------
-- Privilèges par colonne — users
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

SELECT lives_ok(
  $$update public.users set display_name = 'Alice B.'
     where id = '00000000-0000-0000-0000-0000000000e1'$$,
  'Un utilisateur modifie son nom affiché'
);

-- Le privilège de colonne refuse avant même que la policy ne s'applique : sans lui, users.email se désynchroniserait de auth.users, qui reste la source de vérité.
SELECT throws_ok(
  $$update public.users set email = 'pirate@example.com'
     where id = '00000000-0000-0000-0000-0000000000e1'$$,
  '42501',
  NULL,
  'Un utilisateur ne peut pas réécrire son email'
);

-- La policy users_update_self filtre la ligne : l'update ne touche rien plutôt que d'échouer, ce qui est le comportement normal de RLS. On vérifie la valeur après coup, pas le nombre de lignes — c'est ce que l'attaquant obtiendrait qui compte.
SELECT lives_ok(
  $$update public.users set display_name = 'Pirate'
     where id = '00000000-0000-0000-0000-0000000000e2'$$,
  'Viser le nom affiché d''un autre ne lève pas d''erreur'
);

SELECT is(
  (select display_name from public.users where id = '00000000-0000-0000-0000-0000000000e2'),
  'Bob',
  'Mais ne change rien : la policy a filtré la ligne'
);

-- ---------------------------------------------------------------------------
-- Privilèges par colonne — budget_groups
-- ---------------------------------------------------------------------------

SELECT lives_ok(
  $$update public.budget_groups set period_start_day = 27
     where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'Le propriétaire règle le jour de début de période'
);

SELECT throws_ok(
  $$update public.budget_groups set owner_id = '00000000-0000-0000-0000-0000000000e2'
     where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501',
  NULL,
  'Le propriétaire ne peut pas céder son groupe par un update direct'
);

SELECT throws_ok(
  $$update public.budget_groups set is_personal = true
     where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501',
  NULL,
  'Le propriétaire ne peut pas déguiser son groupe en compte personnel'
);

-- Bob, simple membre : la policy budget_groups_update_owner filtre la ligne.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);

SELECT lives_ok(
  $$update public.budget_groups set period_start_day = 15
     where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'Un simple membre qui règle la période ne lève pas d''erreur'
);

-- La valeur reste celle qu'Alice a posée plus haut : la policy budget_groups_update_owner a filtré la ligne pour Bob.
SELECT is(
  (select period_start_day from public.budget_groups
    where id = '00000000-0000-0000-0000-0000000000c1'),
  27::smallint,
  'Mais ne change rien : le réglage reste celui du propriétaire'
);

-- ---------------------------------------------------------------------------
-- owned_groups_with_other_members()
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

SELECT is(
  (select count(*)::integer from public.owned_groups_with_other_members()),
  1,
  'Un groupe partagé possédé et peuplé bloque la suppression'
);

SELECT is(
  (select name from public.owned_groups_with_other_members()),
  'Coloc',
  'Le groupe bloquant est nommé, pour que l''écran puisse le désigner'
);

-- Carol possède Solo, mais y est seule : rien ne bloque. Son compte personnel, créé par handle_new_user(), est exclu par le filtre `not is_personal`.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);

SELECT is(
  (select count(*)::integer from public.owned_groups_with_other_members()),
  0,
  'Un groupe possédé où l''on est seul ne bloque pas, ni le compte personnel'
);

-- Bob n'est que membre de Coloc : le groupe ne lui appartient pas.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);

SELECT is(
  (select count(*)::integer from public.owned_groups_with_other_members()),
  0,
  'Un groupe dont on est simple membre ne bloque pas'
);

-- ---------------------------------------------------------------------------
-- delete_own_account() — refus
-- ---------------------------------------------------------------------------

set local role anon;

SELECT throws_ok(
  $$select public.delete_own_account()$$,
  '42501',
  NULL,
  'Un visiteur anonyme ne peut pas appeler la suppression'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

-- C'est la fermeture de l'échappatoire : avant cette fonction, Alice pouvait quitter Coloc en supprimant son compte, guard_owner_orphan() ne bloquant qu'à pg_trigger_depth() = 1.
SELECT throws_ok(
  $$select public.delete_own_account()$$,
  'P0001',
  'Groupes partagés dont vous êtes propriétaire et qui ont encore d''autres membres : « Coloc ». Excluez ces membres avant de supprimer votre compte.',
  'Un propriétaire de groupe peuplé ne peut pas supprimer son compte'
);

set local role postgres;

SELECT is(
  (select count(*)::integer from auth.users where id = '00000000-0000-0000-0000-0000000000e1'),
  1,
  'Le refus ne supprime rien'
);

-- ---------------------------------------------------------------------------
-- delete_own_account() — suppression d'un simple membre
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);

SELECT lives_ok(
  $$select public.delete_own_account()$$,
  'Un simple membre supprime son compte'
);

set local role postgres;

-- Les opérations du membre partent avec lui, y compris dans un groupe qui lui survit : comportement du on delete cascade sur transactions.user_id, conservé plutôt que d'effacer l'auteur — voir la spec, section 1.
SELECT is(
  (select count(*)::integer from public.transactions
    where id = '00000000-0000-0000-0000-0000000000d1'),
  0,
  'Les opérations du membre supprimé disparaissent'
);

SELECT is(
  (select count(*)::integer from public.transactions
    where id = '00000000-0000-0000-0000-0000000000d2'),
  1,
  'Les opérations des autres membres restent'
);

SELECT is(
  (select count(*)::integer from public.budget_groups
    where id = '00000000-0000-0000-0000-0000000000c1'),
  1,
  'Le groupe partagé survit au départ d''un membre'
);

-- ---------------------------------------------------------------------------
-- join_group_with_code() — groupe sans propriétaire
-- ---------------------------------------------------------------------------

-- Carol quitte Solo, dont elle est seule membre : autorisé par guard_owner_orphan(), qui ne bloque que si d'autres membres restent. L'invitation créée avant son départ reste valide.
insert into public.group_invitations (id, group_id, code, created_by, expires_at)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c2',
        'ORPHAN', '00000000-0000-0000-0000-0000000000e3', now() + interval '7 days');

delete from public.account_memberships
 where group_id = '00000000-0000-0000-0000-0000000000c2'
   and user_id = '00000000-0000-0000-0000-0000000000e3';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e4","role":"authenticated"}', true);

SELECT throws_ok(
  $$select public.join_group_with_code('ORPHAN')$$,
  'P0001',
  'Ce groupe n''a plus de propriétaire : il ne peut plus être rejoint',
  'Un groupe sans propriétaire ne peut plus être rejoint'
);

set local role postgres;

-- L'invitation n'est pas consommée : le refus survient avant le update, donc elle reste utilisable si le groupe retrouvait un propriétaire.
SELECT is(
  (select used_at from public.group_invitations
    where id = '00000000-0000-0000-0000-0000000000b1'),
  NULL,
  'Le refus ne consomme pas l''invitation'
);

SELECT * FROM finish();
ROLLBACK;
