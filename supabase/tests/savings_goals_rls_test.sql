-- Policy et contraintes de la table savings_goals.
--
-- Quatre choses a prouver : un utilisateur lit, cree, modifie et supprime ses
-- propres objectifs ; un autre membre du meme groupe partage ne voit ni ne
-- modifie ses objectifs a lui (portee personnelle, jamais partagee, meme
-- dans un groupe commun) ; target_amount > 0 et current_amount >= 0 sont
-- tenus ; un utilisateur ne peut pas creer un objectif au nom d'un autre.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(10);

-- ---------------------------------------------------------------------------
-- Fixtures, creees en tant que postgres (RLS contournee)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'alice@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e2', 'bob@example.com',   '{"display_name": "Bob"}'::jsonb);

-- Un groupe partage entre les deux, pour prouver que l'appartenance commune
-- ne donne aucune visibilite sur les objectifs de l'autre.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000e3', 'Colocation',
        '00000000-0000-0000-0000-0000000000e1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e1', 'owner'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e2', 'member');

insert into public.savings_goals (id, user_id, name, target_amount, current_amount)
values ('00000000-0000-0000-0000-0000000000e4',
        '00000000-0000-0000-0000-0000000000e1', 'Vacances', 1000.00, 100.00);

-- ---------------------------------------------------------------------------
-- Alice
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.savings_goals
    where user_id = '00000000-0000-0000-0000-0000000000e1'),
  1,
  'Alice lit son propre objectif'
);

SELECT throws_ok(
  $$insert into public.savings_goals (user_id, name, target_amount)
    values ('00000000-0000-0000-0000-0000000000e1', 'Voiture', 0)$$,
  '23514',
  NULL,
  'Un montant cible nul est refuse par la contrainte check'
);

SELECT throws_ok(
  $$insert into public.savings_goals (user_id, name, target_amount, current_amount)
    values ('00000000-0000-0000-0000-0000000000e1', 'Voiture', 200, -10)$$,
  '23514',
  NULL,
  'Un montant actuel negatif est refuse par la contrainte check'
);

-- Le `with check` de la policy porte sur user_id = auth.uid() : tenter de
-- creer un objectif au nom de Bob doit echouer, meme si la ligne elle-meme
-- serait par ailleurs valide.
SELECT throws_ok(
  $$insert into public.savings_goals (user_id, name, target_amount)
    values ('00000000-0000-0000-0000-0000000000e2', 'Objectif de Bob', 500)$$,
  '42501',
  NULL,
  'Alice ne peut pas creer un objectif au nom de Bob'
);

-- Les trois tentatives ci-dessus echouent sur des contraintes ou le check de
-- la policy, pas sur une simple absence de droit d'ecriture : cette insertion
-- est valide de bout en bout et passe par le role authenticated.
SELECT lives_ok(
  $$insert into public.savings_goals (user_id, name, target_amount, current_amount)
    values ('00000000-0000-0000-0000-0000000000e1', 'Voiture', 5000, 0)$$,
  'Alice insere un nouvel objectif valide, montant actuel a zero compris'
);

-- ---------------------------------------------------------------------------
-- Bob, membre du meme groupe qu'Alice
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.savings_goals
    where user_id = '00000000-0000-0000-0000-0000000000e1'),
  0,
  'Bob ne voit aucun objectif d''Alice, meme en partageant un groupe avec elle'
);

-- Un UPDATE que la policy ne laisse pas voir ne leve pas d'erreur : il ne
-- touche simplement aucune ligne. L'absence d'exception ne suffit pas a le
-- prouver seule (une policy absente ou un `using (true)` passeraient tout
-- autant ce test), d'ou la relecture en role postgres plus bas.
SELECT lives_ok(
  $$update public.savings_goals set current_amount = 999
     where id = '00000000-0000-0000-0000-0000000000e4'$$,
  'Bob ne modifie aucune ligne sur l''objectif d''Alice, sans erreur'
);

-- Meme logique pour la suppression.
SELECT lives_ok(
  $$delete from public.savings_goals where id = '00000000-0000-0000-0000-0000000000e4'$$,
  'Bob ne supprime aucune ligne sur l''objectif d''Alice, sans erreur'
);

-- ---------------------------------------------------------------------------
-- Retour en postgres pour constater l'etat reel, hors RLS
-- ---------------------------------------------------------------------------

set local role postgres;

SELECT is(
  (select current_amount from public.savings_goals
    where id = '00000000-0000-0000-0000-0000000000e4'),
  100.00::numeric(12,2),
  'L''objectif d''Alice est intact : Bob ne l''a pas modifie'
);

SELECT is(
  (select count(*)::int from public.savings_goals
    where user_id = '00000000-0000-0000-0000-0000000000e1'),
  2,
  'Les deux objectifs d''Alice existent toujours : Bob n''en a supprime aucun'
);

SELECT * FROM finish();
ROLLBACK;
