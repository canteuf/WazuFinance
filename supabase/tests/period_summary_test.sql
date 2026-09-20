-- Totaux d'une période budgétaire.
--
-- Deux choses à prouver ici. D'abord l'arithmétique et surtout ses bornes :
-- l'intervalle est semi-ouvert, la borne basse compte et la borne haute non.
-- Ensuite la sécurité : period_summary est security invoker, donc un
-- non-membre doit obtenir zéro sans que rien ne fuie.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(13);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'alice@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f2', 'bob@example.com',   '{"display_name": "Bob"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000a1', 'Colocation',
        '00000000-0000-0000-0000-0000000000f1', false);

insert into public.account_memberships (group_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000f1', 'owner');

-- Période exercée : [2026-09-03, 2026-10-03). Les cinq lignes ci-dessous
-- couvrent l'intérieur et les deux bornes.
insert into public.transactions (group_id, user_id, category_id, type, amount, occurred_on) values
  -- Sur la borne basse : comptée.
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Salaire'),
   'income', 1000.00, '2026-09-03'),
  -- Au milieu.
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 24.90, '2026-09-15'),
  -- Dernier jour inclus.
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Transport'),
   'expense', 100.10, '2026-10-02'),
  -- Sur la borne haute : exclue.
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Salaire'),
   'income', 500.00, '2026-10-03'),
  -- Avant la borne basse : exclue.
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 7.00, '2026-09-02');

-- ---------------------------------------------------------------------------
-- Alice, membre du groupe
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

SELECT is(
  (select income from public.period_summary(
     '00000000-0000-0000-0000-0000000000a1', '2026-09-03', '2026-10-03'))::numeric(12,2),
  1000.00::numeric(12,2),
  'Les entrées de la période sont sommées'
);

SELECT is(
  (select expense from public.period_summary(
     '00000000-0000-0000-0000-0000000000a1', '2026-09-03', '2026-10-03'))::numeric(12,2),
  125.00::numeric(12,2),
  'Les sorties de la période sont sommées'
);

-- Le solde est calculé en SQL et non côté client : c'est toute la raison d'être
-- de cette fonction, une soustraction de numeric restant exacte.
SELECT is(
  (select balance from public.period_summary(
     '00000000-0000-0000-0000-0000000000a1', '2026-09-03', '2026-10-03'))::numeric(12,2),
  875.00::numeric(12,2),
  'Le solde est la différence exacte des deux totaux'
);

-- Décaler la borne basse d'un jour doit faire disparaître les 1000,00 du 3.
SELECT is(
  (select income from public.period_summary(
     '00000000-0000-0000-0000-0000000000a1', '2026-09-04', '2026-10-03'))::numeric(12,2),
  0.00::numeric(12,2),
  'La borne basse est incluse'
);

-- Repousser la borne haute d'un jour doit faire entrer les 500,00 du 3 octobre.
SELECT is(
  (select income from public.period_summary(
     '00000000-0000-0000-0000-0000000000a1', '2026-09-03', '2026-10-04'))::numeric(12,2),
  1500.00::numeric(12,2),
  'La borne haute est exclue'
);

-- Sans coalesce, sum() sur zéro ligne renverrait NULL et le client aurait à
-- gérer un cas de plus pour un mois sans opération.
SELECT is(
  (select balance from public.period_summary(
     '00000000-0000-0000-0000-0000000000a1', '2027-01-01', '2027-02-01'))::numeric(12,2),
  0.00::numeric(12,2),
  'Une période sans opération renvoie zéro et non NULL'
);

-- ---------------------------------------------------------------------------
-- tx_count — les deux types confondus, mêmes bornes que les sommes
-- ---------------------------------------------------------------------------

-- Trois lignes dans [2026-09-03, 2026-10-03) : le salaire du 3 septembre, les
-- courses du 15 et le transport du 2 octobre. Les deux autres tombent hors
-- bornes. Le compte mêle entrées et sorties : c'est un nombre d'écritures, pas
-- un nombre de dépenses.
SELECT is(
  (select tx_count from public.period_summary(
     '00000000-0000-0000-0000-0000000000a1', '2026-09-03', '2026-10-03')),
  3,
  'Le compte porte sur les deux types et respecte les bornes'
);

-- count(*) rend 0 sur zéro ligne là où sum() rendrait NULL : le client n'a pas
-- de cas de plus à traiter pour une période vide.
SELECT is(
  (select tx_count from public.period_summary(
     '00000000-0000-0000-0000-0000000000a1', '2027-01-01', '2027-02-01')),
  0,
  'Une période sans opération compte zéro et non NULL'
);

-- Même raison que pour le solde : security invoker, donc la policy filtre tout
-- avant le comptage. Le nombre d'écritures d'un groupe est une information sur
-- ce groupe, et ne doit pas fuir plus que ses montants.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);

SELECT is(
  (select tx_count from public.period_summary(
     '00000000-0000-0000-0000-0000000000a1', '2026-09-03', '2026-10-03')),
  0,
  'Un non-membre ne compte aucune opération'
);

-- Retour à Alice pour la suite du fichier.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Bob, étranger au groupe
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);

-- security invoker : la policy transactions_select_member filtre tout, donc la
-- somme porte sur zéro ligne. Zéro et non une erreur — la réponse ne dit pas
-- si le groupe existe.
SELECT is(
  (select balance from public.period_summary(
     '00000000-0000-0000-0000-0000000000a1', '2026-09-03', '2026-10-03'))::numeric(12,2),
  0.00::numeric(12,2),
  'Un non-membre obtient zéro, sans rien apprendre du groupe'
);

-- ---------------------------------------------------------------------------
-- period_start_day
-- ---------------------------------------------------------------------------

set local role postgres;

SELECT is(
  (select period_start_day from public.budget_groups
    where id = '00000000-0000-0000-0000-0000000000a1'),
  1::smallint,
  'Un groupe démarre par défaut au 1er, soit le mois calendaire'
);

-- Le plafond vit en base et non dans un formulaire : il vaut quel que soit le
-- client qui écrit.
SELECT throws_ok(
  $$update public.budget_groups set period_start_day = 0
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514',
  NULL,
  'Un jour de démarrage à 0 est refusé'
);

-- 29, 30 et 31 n'existent pas tous les mois : les autoriser ferait sauter la
-- période en février.
SELECT throws_ok(
  $$update public.budget_groups set period_start_day = 29
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514',
  NULL,
  'Un jour de démarrage au-delà de 28 est refusé'
);

SELECT * FROM finish();
ROLLBACK;
