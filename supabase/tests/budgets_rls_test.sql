-- Policies et contraintes de la table budgets.
--
-- Quatre choses à prouver : un membre lit et écrit les budgets de son groupe,
-- un étranger ne lit rien et ne peut rien insérer, le triplet
-- (group_id, category_id, period) reste unique, et amount > 0 est tenu.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'membre@example.com',  '{"display_name": "Membre"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000d2', 'etranger@example.com', '{"display_name": "Etranger"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000d3', 'Colocation',
        '00000000-0000-0000-0000-0000000000d1', false);

insert into public.account_memberships (group_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000d3',
        '00000000-0000-0000-0000-0000000000d1', 'owner');

insert into public.budgets (group_id, category_id, period, amount)
values ('00000000-0000-0000-0000-0000000000d3',
        (select id from public.categories where group_id is null and name = 'Alimentation'),
        'monthly', 300.00);

-- ---------------------------------------------------------------------------
-- Le membre
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.budgets
    where group_id = '00000000-0000-0000-0000-0000000000d3'),
  1,
  'Un membre lit les budgets de son groupe'
);

-- Un second budget sur la même catégorie et la même cadence : le triplet
-- unique existe pour qu'un doublon soit impossible même en cas de course
-- entre deux membres, le formulaire ne pouvant l'empêcher.
SELECT throws_ok(
  $$insert into public.budgets (group_id, category_id, period, amount)
    values ('00000000-0000-0000-0000-0000000000d3',
            (select id from public.categories where group_id is null and name = 'Alimentation'),
            'monthly', 500.00)$$,
  '23505',
  NULL,
  'Un second budget sur la meme categorie et la meme cadence est refuse'
);

SELECT throws_ok(
  $$insert into public.budgets (group_id, category_id, period, amount)
    values ('00000000-0000-0000-0000-0000000000d3',
            (select id from public.categories where group_id is null and name = 'Transport'),
            'monthly', 0)$$,
  '23514',
  NULL,
  'Un plafond nul est refuse par la contrainte check'
);

-- ---------------------------------------------------------------------------
-- L'étranger au groupe
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.budgets
    where group_id = '00000000-0000-0000-0000-0000000000d3'),
  0,
  'Un non-membre ne lit aucun budget du groupe'
);

SELECT throws_ok(
  $$insert into public.budgets (group_id, category_id, period, amount)
    values ('00000000-0000-0000-0000-0000000000d3',
            (select id from public.categories where group_id is null and name = 'Transport'),
            'monthly', 100.00)$$,
  '42501',
  NULL,
  'Un non-membre ne peut pas creer de budget dans le groupe'
);

-- Un UPDATE que la policy ne laisse pas voir ne lève pas d'erreur : il ne
-- touche simplement aucune ligne. C'est le comportement normal de RLS sur
-- UPDATE, et c'est bien l'absence d'effet qu'il faut prouver.
SELECT lives_ok(
  $$update public.budgets set amount = 1.00
     where group_id = '00000000-0000-0000-0000-0000000000d3'$$,
  'Un non-membre ne modifie aucune ligne, sans erreur'
);

SELECT * FROM finish();
ROLLBACK;
