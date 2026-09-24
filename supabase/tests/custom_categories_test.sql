-- Catégories personnalisées (20260924000100_custom_categories.sql).
--
-- A prouver : un membre crée une catégorie dans son groupe ; un non-membre ne
-- la voit pas et ne peut pas en créer ; personne ne crée de catégorie par
-- défaut ; les homonymes sont refusés, casse comprise, y compris face aux
-- catégories par défaut, mais pas d'un type à l'autre ; le nom et l'icône ont
-- une forme bornée ; seuls le nom et l'icône se modifient.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(16);

-- ---------------------------------------------------------------------------
-- Fixtures, creees en tant que postgres (RLS contournee)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'alice@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c2', 'bob@example.com',   '{"display_name": "Bob"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000c3', 'Famille',
        '00000000-0000-0000-0000-0000000000c1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c1', 'owner');

-- ---------------------------------------------------------------------------
-- Alice, membre du groupe
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

SELECT lives_ok(
  $$insert into public.categories (id, group_id, name, icon, type)
    values ('00000000-0000-0000-0000-0000000000c4',
            '00000000-0000-0000-0000-0000000000c3', 'Animaux', 'paw', 'expense')$$,
  'Un membre cree une categorie dans son groupe'
);

SELECT throws_ok(
  $$insert into public.categories (group_id, name, icon, type)
    values ('00000000-0000-0000-0000-0000000000c3', 'ANIMAUX', 'paw', 'expense')$$,
  'P0001',
  'Une catégorie porte déjà ce nom.',
  'Un homonyme dans le groupe est refuse, casse comprise'
);

SELECT throws_ok(
  $$insert into public.categories (group_id, name, icon, type)
    values ('00000000-0000-0000-0000-0000000000c3', 'alimentation', 'food', 'expense')$$,
  'P0001',
  'Une catégorie porte déjà ce nom.',
  'Un homonyme d''une categorie par defaut est refuse'
);

-- « Cadeau » existe par défaut, mais en revenu : la grille des dépenses ne le montre pas.
SELECT lives_ok(
  $$insert into public.categories (group_id, name, icon, type)
    values ('00000000-0000-0000-0000-0000000000c3', 'Cadeau', 'gift-outline', 'expense')$$,
  'Le meme nom reste permis pour l''autre type'
);

SELECT throws_ok(
  $$insert into public.categories (group_id, name, icon, type)
    values ('00000000-0000-0000-0000-0000000000c3', ' Sport', 'dumbbell', 'expense')$$,
  '23514',
  NULL,
  'Un nom non rogne est refuse'
);

SELECT throws_ok(
  $$insert into public.categories (group_id, name, icon, type)
    values ('00000000-0000-0000-0000-0000000000c3', '', 'dumbbell', 'expense')$$,
  '23514',
  NULL,
  'Un nom vide est refuse'
);

SELECT throws_ok(
  $$insert into public.categories (group_id, name, icon, type)
    values ('00000000-0000-0000-0000-0000000000c3', repeat('a', 31), 'dumbbell', 'expense')$$,
  '23514',
  NULL,
  'Un nom de plus de 30 caracteres est refuse'
);

SELECT throws_ok(
  $$insert into public.categories (group_id, name, icon, type)
    values ('00000000-0000-0000-0000-0000000000c3', 'Sport', '<script>', 'expense')$$,
  '23514',
  NULL,
  'Une icone hors format est refusee'
);

SELECT throws_ok(
  $$insert into public.categories (group_id, name, icon, type)
    values (null, 'Sport', 'dumbbell', 'expense')$$,
  '42501',
  NULL,
  'Personne ne cree de categorie par defaut'
);

SELECT lives_ok(
  $$update public.categories set name = 'Animaux de compagnie', icon = 'dog'
    where id = '00000000-0000-0000-0000-0000000000c4'$$,
  'Le nom et l''icone se modifient'
);

SELECT throws_ok(
  $$update public.categories set type = 'income'
    where id = '00000000-0000-0000-0000-0000000000c4'$$,
  '42501',
  NULL,
  'Le type ne se modifie pas'
);

SELECT throws_ok(
  $$update public.categories set group_id = null
    where id = '00000000-0000-0000-0000-0000000000c4'$$,
  '42501',
  NULL,
  'Le groupe ne se modifie pas'
);

SELECT throws_ok(
  $$update public.categories set name = 'Logement'
    where id = '00000000-0000-0000-0000-0000000000c4'$$,
  'P0001',
  'Une catégorie porte déjà ce nom.',
  'Renommer vers un homonyme est refuse aussi'
);

-- ---------------------------------------------------------------------------
-- Bob, hors du groupe
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.categories
    where group_id = '00000000-0000-0000-0000-0000000000c3'),
  0,
  'Un non-membre ne voit pas les categories du groupe'
);

SELECT ok(
  (select count(*) from public.categories where group_id is null) > 0,
  'Un non-membre voit les categories par defaut'
);

SELECT throws_ok(
  $$insert into public.categories (group_id, name, icon, type)
    values ('00000000-0000-0000-0000-0000000000c3', 'Intrus', 'tag', 'expense')$$,
  '42501',
  NULL,
  'Un non-membre ne cree pas de categorie dans le groupe'
);

SELECT * FROM finish();
ROLLBACK;
