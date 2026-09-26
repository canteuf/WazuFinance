-- Portefeuilles (migration wallets) : portefeuille par défaut, affectation, transferts et soldes.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(22);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000005a1', 'alice-w@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000005a2', 'eve-w@example.com',   '{"display_name": "Eve"}'::jsonb);

create temporary table w_personal as
select g.id from public.budget_groups g
 where g.owner_id = '00000000-0000-0000-0000-0000000005a1' and g.is_personal;
grant select on w_personal to authenticated;

create temporary table w_default as
select w.id from public.wallets w where w.group_id = (select id from w_personal) and w.is_default;
grant select on w_default to authenticated;

SELECT is(
  (select count(*)::int from public.wallets where group_id = (select id from w_personal)),
  1,
  'L''inscription crée un portefeuille par défaut pour le compte personnel'
);

SELECT is(
  (select name from public.wallets where id = (select id from w_default)),
  'Principal',
  'Il s''appelle « Principal »'
);

-- ---------------------------------------------------------------------------
-- En tant qu'Alice
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000005a1","role":"authenticated"}', true);

SELECT lives_ok(
  $$insert into public.wallets (id, group_id, name, kind, opening_balance)
    values ('00000000-0000-0000-0000-0000000005c1', (select id from w_personal), 'MoMo', 'mobile_money', 40000)$$,
  'Alice ajoute un portefeuille MoMo avec 40 000 de départ'
);

SELECT throws_ok(
  $$insert into public.wallets (group_id, name, kind, is_default)
    values ((select id from w_personal), 'Autre', 'cash', true)$$,
  '42501',
  NULL,
  'Le client ne crée pas de portefeuille par défaut'
);

SELECT throws_ok(
  $$insert into public.wallets (group_id, name) values ((select id from w_personal), 'momo')$$,
  '23505',
  NULL,
  'Deux portefeuilles ne portent pas le même nom, casse ignorée'
);

-- Une saisie sans portefeuille, comme celle de l'app déjà installée.
insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on)
values ('00000000-0000-0000-0000-0000000005d1', (select id from w_personal), '00000000-0000-0000-0000-0000000005a1',
        (select id from public.categories where group_id is null and name = 'Salaire'), 'income', 100000, '2026-09-01');

SELECT is(
  (select wallet_id from public.transactions where id = '00000000-0000-0000-0000-0000000005d1'),
  (select id from w_default),
  'Une opération saisie sans portefeuille va dans celui par défaut'
);

insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on, wallet_id)
values ('00000000-0000-0000-0000-0000000005d2', (select id from w_personal), '00000000-0000-0000-0000-0000000005a1',
        (select id from public.categories where group_id is null and name = 'Crédit & data'), 'expense', 2000, '2026-09-02',
        '00000000-0000-0000-0000-0000000005c1');

SELECT is(
  (select wallet_id from public.transactions where id = '00000000-0000-0000-0000-0000000005d2'),
  '00000000-0000-0000-0000-0000000005c1'::uuid,
  'Une opération garde le portefeuille choisi'
);

-- ---------------------------------------------------------------------------
-- Transfert MoMo → Principal, avec frais
-- ---------------------------------------------------------------------------

SELECT lives_ok(
  $$select public.transfer_between_wallets(
      '00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-0000000005c1',
      (select id from w_default), 20000, '2026-09-03',
      '00000000-0000-0000-0000-0000000005d3', 300, 'Retrait')$$,
  'Alice retire 20 000 de MoMo vers le Principal, 300 de frais'
);

SELECT results_eq(
  $$select type::text, amount, wallet_id, (select name from public.categories c where c.id = category_id)
      from public.transactions where id = '00000000-0000-0000-0000-0000000005d3'$$,
  $$values ('expense', 300.00::numeric(12,2), '00000000-0000-0000-0000-0000000005c1'::uuid, 'Frais mobile money')$$,
  'Les frais sont une dépense « Frais mobile money » sur le portefeuille d''origine'
);

SELECT lives_ok(
  $$select public.transfer_between_wallets(
      '00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-0000000005c1',
      (select id from w_default), 20000, '2026-09-03',
      '00000000-0000-0000-0000-0000000005d3', 300, 'Retrait')$$,
  'Renvoyer le même transfert ne lève pas d''erreur'
);

SELECT is(
  (select count(*)::int from public.wallet_transfers where group_id = (select id from w_personal)),
  1,
  'Et ne crée pas de doublon'
);

SELECT throws_ok(
  $$select public.transfer_between_wallets(
      '00000000-0000-0000-0000-0000000005e2', '00000000-0000-0000-0000-0000000005c1',
      '00000000-0000-0000-0000-0000000005c1', 1000, '2026-09-03',
      '00000000-0000-0000-0000-0000000005d4')$$,
  'P0001',
  'Choisissez deux portefeuilles différents.',
  'Un transfert vers le même portefeuille est refusé'
);

-- ---------------------------------------------------------------------------
-- Soldes
-- ---------------------------------------------------------------------------

-- MoMo : 40 000 − 2 000 (crédit) − 300 (frais) − 20 000 (transfert) = 17 700. Principal : 0 + 100 000 + 20 000 = 120 000.
SELECT results_eq(
  $$select name, balance from public.wallets_overview((select id from w_personal))$$,
  $$values ('Principal', 120000.00::numeric), ('MoMo', 17700.00::numeric)$$,
  'Le solde de chaque portefeuille tient compte du départ, des opérations et des transferts'
);

-- Le transfert ne change pas le solde du groupe ; seuls les frais comptent en dépense.
SELECT results_eq(
  $$select income, expense, balance from public.period_summary((select id from w_personal), '2026-09-01', '2026-10-01')$$,
  $$values (100000.00::numeric, 2300.00::numeric, 97700.00::numeric)$$,
  'Le transfert ne touche pas le solde de la période, les frais oui'
);

SELECT is(
  public.adjust_wallet_balance('00000000-0000-0000-0000-0000000005c1', 15000),
  -2700.00::numeric,
  'Ajuster MoMo au solde réel de 15 000 rend l''écart'
);

SELECT is(
  (select balance from public.wallets_overview((select id from w_personal)) where name = 'MoMo'),
  15000.00::numeric,
  'Le portefeuille affiche désormais le solde réel'
);

SELECT is(
  (select expense from public.period_summary((select id from w_personal), '2026-09-01', '2026-10-01')),
  2300.00::numeric,
  'L''ajustement ne crée aucune dépense dans la période'
);

-- ---------------------------------------------------------------------------
-- Suppression
-- ---------------------------------------------------------------------------

SELECT throws_ok(
  $$delete from public.wallets where id = (select id from w_default)$$,
  'P0001',
  'Le portefeuille par défaut ne se supprime pas. Renommez-le si besoin.',
  'Le portefeuille par défaut ne se supprime pas'
);

SELECT throws_ok(
  $$delete from public.wallets where id = '00000000-0000-0000-0000-0000000005c1'$$,
  'P0001',
  'Ce portefeuille contient des opérations ou des transferts : il ne peut pas être supprimé.',
  'Un portefeuille utilisé ne se supprime pas'
);

insert into public.wallets (id, group_id, name) values ('00000000-0000-0000-0000-0000000005c2', (select id from w_personal), 'Vide');

SELECT lives_ok(
  $$delete from public.wallets where id = '00000000-0000-0000-0000-0000000005c2'$$,
  'Un portefeuille vide se supprime'
);

-- ---------------------------------------------------------------------------
-- Eve, étrangère au compte d'Alice
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000005a2","role":"authenticated"}', true);

SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, type, amount, wallet_id)
    values ((select id from public.budget_groups where owner_id = '00000000-0000-0000-0000-0000000005a2' and is_personal),
            '00000000-0000-0000-0000-0000000005a2', 'expense', 100, '00000000-0000-0000-0000-0000000005c1')$$,
  'P0001',
  'Ce portefeuille n''appartient pas à ce budget.',
  'On ne range pas une opération dans le portefeuille d''un autre groupe'
);

-- ---------------------------------------------------------------------------
-- La suppression d'un compte emporte ses portefeuilles
-- ---------------------------------------------------------------------------

set local role postgres;

SELECT lives_ok(
  $$delete from auth.users where id = '00000000-0000-0000-0000-0000000005a1'$$,
  'La suppression du compte emporte portefeuilles, transferts et opérations'
);

SELECT * FROM finish();
ROLLBACK;
