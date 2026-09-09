-- Répartition des dépenses par catégorie.
--
-- Trois choses à prouver : l'agrégation par catégorie, le tri décroissant qui
-- fixe l'ordre d'affichage, et l'exclusion des revenus — une répartition des
-- dépenses qui compterait un salaire serait fausse sans que rien ne le signale.
--
-- Et la sécurité : la fonction est security invoker, donc un non-membre doit
-- obtenir un résultat vide.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c9', 'alice@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000ca', 'bob@example.com',   '{"display_name": "Bob"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000cb', 'Colocation',
        '00000000-0000-0000-0000-0000000000c9', false);

insert into public.account_memberships (group_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000cb',
        '00000000-0000-0000-0000-0000000000c9', 'owner');

-- Période exercée : [2026-09-01, 2026-10-01).
--   Alimentation : 30 + 20 = 50   (deux lignes, à agréger)
--   Transport    : 80             (une seule ligne, mais la plus grosse)
--   Salaire      : 1000           (revenu, à exclure)
--   Logement     : 500            (hors période, à exclure)
insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on) values
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-0000000000c9',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 30.00, '2026-09-05'),
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-0000000000c9',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 20.00, '2026-09-12'),
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-0000000000c9',
   (select id from public.categories where group_id is null and name = 'Transport'),
   'expense', 80.00, '2026-09-09'),
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-0000000000c9',
   (select id from public.categories where group_id is null and name = 'Salaire'),
   'income', 1000.00, '2026-09-02'),
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-0000000000c9',
   (select id from public.categories where group_id is null and name = 'Logement'),
   'expense', 500.00, '2026-08-28');

-- ---------------------------------------------------------------------------
-- Alice, membre du groupe
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c9","role":"authenticated"}', true);

-- Transport (80) avant Alimentation (50) : le tri est décroissant sur le total,
-- pas alphabétique. C'est cet ordre que le client affiche tel quel.
SELECT is(
  (select array_agg(name order by total desc, name asc)
     from public.category_breakdown(
       '00000000-0000-0000-0000-0000000000cb', '2026-09-01', '2026-10-01')),
  ARRAY['Transport', 'Alimentation']::text[],
  'Les catégories sortent triées par total décroissant'
);

SELECT is(
  (select total from public.category_breakdown(
     '00000000-0000-0000-0000-0000000000cb', '2026-09-01', '2026-10-01')
    where name = 'Alimentation')::numeric(12,2),
  50.00::numeric(12,2),
  'Deux lignes d''une même catégorie sont agrégées en une part'
);

-- Un revenu dans une répartition des dépenses la fausserait entièrement.
SELECT is(
  (select count(*)::int from public.category_breakdown(
     '00000000-0000-0000-0000-0000000000cb', '2026-09-01', '2026-10-01')
    where name = 'Salaire'),
  0,
  'Les revenus sont exclus de la répartition des dépenses'
);

-- Le 28 août est hors de [2026-09-01, 2026-10-01).
SELECT is(
  (select count(*)::int from public.category_breakdown(
     '00000000-0000-0000-0000-0000000000cb', '2026-09-01', '2026-10-01')
    where name = 'Logement'),
  0,
  'Une dépense hors période est exclue'
);

-- Une période sans dépense rend zéro ligne, et non une ligne à zéro.
SELECT is(
  (select count(*)::int from public.category_breakdown(
     '00000000-0000-0000-0000-0000000000cb', '2027-01-01', '2027-02-01')),
  0,
  'Une période sans dépense ne rend aucune ligne'
);

-- ---------------------------------------------------------------------------
-- Bob, étranger au groupe
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ca","role":"authenticated"}', true);

-- security invoker : transactions_select_member filtre tout en amont de
-- l'agrégation, donc il ne reste rien à grouper.
SELECT is(
  (select count(*)::int from public.category_breakdown(
     '00000000-0000-0000-0000-0000000000cb', '2026-09-01', '2026-10-01')),
  0,
  'Un non-membre n''obtient aucune part'
);

SELECT * FROM finish();
ROLLBACK;
