-- Invariant de la pagination par curseur de l'écran 3.
--
-- La pagination porte sur le couple (occurred_on, id) et non sur un décalage :
-- entre deux pages, une insertion décalerait toutes les suivantes et ferait
-- apparaître une ligne deux fois, une suppression en sauterait une.
--
-- Les fixtures contiennent volontairement deux lignes à la même date. C'est le
-- seul cas où le départage par id compte, et donc le seul où un défaut se voit.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(4);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'alice@example.com', '{"display_name": "Alice"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000b9', 'Colocation',
        '00000000-0000-0000-0000-0000000000b1', false);

insert into public.account_memberships (group_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000b9',
        '00000000-0000-0000-0000-0000000000b1', 'owner');

-- Ordre attendu, par (occurred_on desc, id desc) :
--   ab01 (09-10), ab03 (09-08), ab02 (09-08), ab04 (09-05), ab05 (09-01)
-- ab03 précède ab02 : même date, id supérieur.
insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on) values
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-0000000000b9',
   '00000000-0000-0000-0000-0000000000b1',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 10.00, '2026-09-10'),
  ('00000000-0000-0000-0000-00000000ab02', '00000000-0000-0000-0000-0000000000b9',
   '00000000-0000-0000-0000-0000000000b1',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 20.00, '2026-09-08'),
  ('00000000-0000-0000-0000-00000000ab03', '00000000-0000-0000-0000-0000000000b9',
   '00000000-0000-0000-0000-0000000000b1',
   (select id from public.categories where group_id is null and name = 'Transport'),
   'expense', 30.00, '2026-09-08'),
  ('00000000-0000-0000-0000-00000000ab04', '00000000-0000-0000-0000-0000000000b9',
   '00000000-0000-0000-0000-0000000000b1',
   (select id from public.categories where group_id is null and name = 'Logement'),
   'expense', 40.00, '2026-09-05'),
  ('00000000-0000-0000-0000-00000000ab05', '00000000-0000-0000-0000-0000000000b9',
   '00000000-0000-0000-0000-0000000000b1',
   (select id from public.categories where group_id is null and name = 'Salaire'),
   'income', 50.00, '2026-09-01');

-- ---------------------------------------------------------------------------
-- Page 1 : aucun curseur
-- ---------------------------------------------------------------------------

SELECT is(
  (select array_agg(id order by occurred_on desc, id desc)
     from (select id, occurred_on from public.transactions
            where group_id = '00000000-0000-0000-0000-0000000000b9'
            order by occurred_on desc, id desc
            limit 2) as page),
  ARRAY['00000000-0000-0000-0000-00000000ab01',
        '00000000-0000-0000-0000-00000000ab03']::uuid[],
  'La première page rend les deux lignes les plus récentes, id décroissant à date égale'
);

-- ---------------------------------------------------------------------------
-- Page 2 : curseur sur la dernière ligne de la page 1, soit (09-08, ab03)
-- ---------------------------------------------------------------------------

-- C'est ici que le départage compte : ab02 partage sa date avec le curseur et
-- doit malgré tout être renvoyée, parce que son id lui est inférieur.
SELECT is(
  (select array_agg(id order by occurred_on desc, id desc)
     from (select id, occurred_on from public.transactions
            where group_id = '00000000-0000-0000-0000-0000000000b9'
              and (occurred_on, id) < ('2026-09-08'::date,
                                       '00000000-0000-0000-0000-00000000ab03'::uuid)
            order by occurred_on desc, id desc
            limit 2) as page),
  ARRAY['00000000-0000-0000-0000-00000000ab02',
        '00000000-0000-0000-0000-00000000ab04']::uuid[],
  'La deuxième page reprend à la ligne suivante, sans répéter ni sauter la date partagée'
);

-- ---------------------------------------------------------------------------
-- Page 3 : curseur (09-05, ab04). Plus courte que la limite : c'est la fin.
-- ---------------------------------------------------------------------------

SELECT is(
  (select array_agg(id order by occurred_on desc, id desc)
     from (select id, occurred_on from public.transactions
            where group_id = '00000000-0000-0000-0000-0000000000b9'
              and (occurred_on, id) < ('2026-09-05'::date,
                                       '00000000-0000-0000-0000-00000000ab04'::uuid)
            order by occurred_on desc, id desc
            limit 2) as page),
  ARRAY['00000000-0000-0000-0000-00000000ab05']::uuid[],
  'La dernière page est plus courte que la limite demandée'
);

-- ---------------------------------------------------------------------------
-- La réunion des trois pages, dans l'ordre de parcours : les cinq lignes, une
-- seule fois chacune. C'est l'assertion qui prouve réellement l'absence de
-- doublon et de trou — compter les lignes de la table ne prouverait rien.
-- ---------------------------------------------------------------------------

WITH page1 AS (
  select id, occurred_on, 1 as page from public.transactions
   where group_id = '00000000-0000-0000-0000-0000000000b9'
   order by occurred_on desc, id desc
   limit 2
), page2 AS (
  select id, occurred_on, 2 as page from public.transactions
   where group_id = '00000000-0000-0000-0000-0000000000b9'
     and (occurred_on, id) < ('2026-09-08'::date,
                              '00000000-0000-0000-0000-00000000ab03'::uuid)
   order by occurred_on desc, id desc
   limit 2
), page3 AS (
  select id, occurred_on, 3 as page from public.transactions
   where group_id = '00000000-0000-0000-0000-0000000000b9'
     and (occurred_on, id) < ('2026-09-05'::date,
                              '00000000-0000-0000-0000-00000000ab04'::uuid)
   order by occurred_on desc, id desc
   limit 2
), parcours AS (
  select * from page1
  union all select * from page2
  union all select * from page3
)
SELECT is(
  (select array_agg(id order by page, occurred_on desc, id desc) from parcours),
  ARRAY['00000000-0000-0000-0000-00000000ab01',
        '00000000-0000-0000-0000-00000000ab03',
        '00000000-0000-0000-0000-00000000ab02',
        '00000000-0000-0000-0000-00000000ab04',
        '00000000-0000-0000-0000-00000000ab05']::uuid[],
  'Le parcours des trois pages rend les cinq lignes dans l''ordre, sans doublon ni trou'
);

SELECT * FROM finish();
ROLLBACK;
