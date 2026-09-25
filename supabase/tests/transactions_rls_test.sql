-- Isolation des transactions entre groupes.
--
-- La sécurité de Wazu Finance vit dans la base : un utilisateur ne lit et
-- n'écrit que les transactions des groupes dont il est membre. Ces tests
-- exercent les policies en se faisant passer pour chaque utilisateur, via le
-- rôle authenticated et la claim JWT sub.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(13);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contourné)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'alice@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c2', 'bob@example.com',   '{"display_name": "Bob"}'::jsonb);

-- Chaque inscription a créé un groupe personnel via handle_new_user().
-- On ajoute un groupe partagé dont seule Alice est membre.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000d1', 'Colocation',
        '00000000-0000-0000-0000-0000000000c1', false);

insert into public.account_memberships (group_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000c1', 'owner');

insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on)
values ('00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000c1',
        (select id from public.categories where group_id is null and name = 'Alimentation'),
        'expense', 24.90, current_date);

-- ---------------------------------------------------------------------------
-- Alice, membre du groupe partagé
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.transactions
    where group_id = '00000000-0000-0000-0000-0000000000d1'),
  1,
  'Un membre lit les transactions de son groupe'
);

-- Le compte exact dépend du seed, pas des policies : figer 14 ici casserait
-- ce test dès qu'une catégorie par défaut de plus serait ajoutée, sans
-- rapport avec ce que la policy garantit réellement (la lisibilité).
SELECT ok(
  (select count(*)::int from public.categories where group_id is null) > 0,
  'Les catégories par défaut sont lisibles par tout utilisateur authentifié'
);

-- Lisibles, mais non modifiables : categories_update_member exige
-- group_id is not null, qu'aucune catégorie par défaut ne satisfait — même
-- un membre authentifié ne peut donc pas en modifier une.
-- Le WITH modifiant doit être au premier niveau de la requête (règle
-- Postgres), d'où ce bloc plutôt qu'une sous-requête passée à is().
WITH attempt AS (
  UPDATE public.categories SET icon = 'edited-by-member'
   WHERE group_id IS NULL AND name = 'Alimentation'
  RETURNING id
)
SELECT is(
  (select count(*)::int from attempt),
  0,
  'Un membre authentifié ne peut pas modifier une catégorie par défaut'
);

SELECT lives_ok(
  $$insert into public.transactions (group_id, user_id, type, amount, category_id)
    values ('00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000000c1',
            'expense', 10.00,
            (select id from public.categories where group_id is null and name = 'Transport'))$$,
  'Un membre insère dans son groupe'
);

-- Création rejouable : l'app fournit l'id et écrit `on conflict (id) do nothing` (src/data/transactions.ts). Le second envoi de la même saisie passe sous RLS sans erreur et ne crée rien.
insert into public.transactions (id, group_id, user_id, type, amount)
values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000c1', 'expense', 15.00)
on conflict (id) do nothing;

SELECT lives_ok(
  $$insert into public.transactions (id, group_id, user_id, type, amount)
    values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000000c1', 'expense', 15.00)
    on conflict (id) do nothing$$,
  'Renvoyer une création déjà enregistrée ne lève pas d''erreur'
);

SELECT is(
  (select count(*)::int from public.transactions
    where id = '00000000-0000-0000-0000-0000000000e2'),
  1,
  'Renvoyer une création déjà enregistrée ne crée pas de doublon'
);

-- user_id est imposé par la policy : on ne peut pas écrire au nom d'un autre.
SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, type, amount)
    values ('00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000000c2',
            'expense', 10.00)$$,
  '42501',
  NULL,
  'Un membre ne peut pas insérer au nom d''un autre utilisateur'
);

-- ---------------------------------------------------------------------------
-- Bob, étranger au groupe partagé
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.transactions
    where group_id = '00000000-0000-0000-0000-0000000000d1'),
  0,
  'Un non-membre ne voit aucune transaction du groupe'
);

SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, type, amount)
    values ('00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000000c2',
            'expense', 10.00)$$,
  '42501',
  NULL,
  'Un non-membre ne peut pas insérer dans le groupe'
);

-- Un UPDATE bloqué par RLS ne lève pas d'erreur : il ne touche aucune ligne.
update public.transactions set amount = 999.00
 where id = '00000000-0000-0000-0000-0000000000e1';

SELECT is(
  (select count(*)::int from public.transactions
    where id = '00000000-0000-0000-0000-0000000000e1'),
  0,
  'Un non-membre ne voit pas la ligne qu''il tente de modifier'
);

delete from public.transactions where id = '00000000-0000-0000-0000-0000000000e1';

-- Retour en postgres pour constater l'état réel, hors RLS.
set local role postgres;

SELECT is(
  (select amount from public.transactions
    where id = '00000000-0000-0000-0000-0000000000e1'),
  24.90::numeric(12,2),
  'La transaction est intacte : ni modifiée ni supprimée par le non-membre'
);

-- ---------------------------------------------------------------------------
-- Budget partagé : tout membre corrige les lignes du groupe
-- ---------------------------------------------------------------------------

insert into public.account_memberships (group_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000c2', 'member');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);

update public.transactions set amount = 30.00
 where id = '00000000-0000-0000-0000-0000000000e1';

set local role postgres;

SELECT is(
  (select amount from public.transactions
    where id = '00000000-0000-0000-0000-0000000000e1'),
  30.00::numeric(12,2),
  'Un membre corrige une ligne créée par un autre membre du même groupe'
);

-- Même chose pour la suppression : Bob (membre, pas créateur) supprime la
-- ligne qu'Alice a créée puis que lui-même a corrigée ci-dessus.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);

delete from public.transactions where id = '00000000-0000-0000-0000-0000000000e1';

set local role postgres;

SELECT is(
  (select count(*)::int from public.transactions
    where id = '00000000-0000-0000-0000-0000000000e1'),
  0,
  'Un membre supprime une ligne créée par un autre membre du même groupe'
);

SELECT * FROM finish();
ROLLBACK;
