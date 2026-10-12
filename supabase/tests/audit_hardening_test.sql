-- Durcissement issu de l'audit du 12 octobre 2026 (20261012000100_audit_hardening.sql).
--
-- Chaque test reprend un défaut prouvé sur la pile locale avant la migration, et vérifie qu'il ne passe plus.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(24);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres : Alice propriétaire de « Tontine », Bob membre, Carol membre
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000aa01', 'alice-h@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-00000000aa02', 'bob-h@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-00000000aa03', 'carol-h@example.com', '{"display_name": "Carol"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal) values
  ('00000000-0000-0000-0000-00000000ab01', 'Tontine', '00000000-0000-0000-0000-00000000aa01', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa01', 'owner'),
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa02', 'member'),
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa03', 'member');

insert into public.budgets (id, group_id, category_id, amount) values
  ('00000000-0000-0000-0000-00000000ac01', '00000000-0000-0000-0000-00000000ab01',
   (select id from public.categories where group_id is null and name = 'Alimentation'), 100000);

-- ---------------------------------------------------------------------------
-- En tant que Bob
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa02","role":"authenticated"}', true);

-- 2. Horodatages
insert into public.transactions (id, group_id, user_id, type, amount, category_id, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa02',
        'expense', 50000, (select id from public.categories where group_id is null and name = 'Alimentation'),
        '2999-01-01', '2999-01-01');

SELECT ok(
  (select created_at <= now() from public.transactions where id = '00000000-0000-0000-0000-00000000ad01'),
  'created_at fourni par le client est remplacé par l''heure du serveur'
);

update public.transactions set amount = 500 where id = '00000000-0000-0000-0000-00000000ad01';

-- Dans une seule transaction, now() ne bouge pas : on vérifie que updated_at n'est plus jamais antérieur à created_at, ce qui faisait disparaître la mention « modifié ».
SELECT ok(
  (select updated_at >= created_at from public.transactions where id = '00000000-0000-0000-0000-00000000ad01'),
  'une opération modifiée ne peut plus cacher sa modification'
);

-- 3. Groupe orphelin
SELECT throws_ok(
  $$insert into public.budget_groups (name, owner_id) values ('Orphelin', '00000000-0000-0000-0000-00000000aa02')$$,
  '42501', NULL,
  'un client ne crée pas de groupe par une insertion directe'
);

SELECT ok(
  public.create_shared_group('Par la fonction') is not null,
  'create_shared_group() crée toujours un groupe'
);

-- 5. Type de catégorie
SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, type, amount, category_id)
    values ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa02', 'expense', 7000,
            (select id from public.categories where group_id is null and name = 'Salaire'))$$,
  'P0001', 'Cette catégorie ne correspond pas au type de l’opération.',
  'une dépense ne se range pas dans une catégorie de revenu'
);

SELECT throws_ok(
  $$update public.transactions set type = 'income' where id = '00000000-0000-0000-0000-00000000ad01'$$,
  'P0001', 'Cette catégorie ne correspond pas au type de l’opération.',
  'changer seulement le type est vérifié aussi'
);

SELECT throws_ok(
  $$insert into public.budgets (group_id, category_id, amount)
    values ('00000000-0000-0000-0000-00000000ab01', (select id from public.categories where group_id is null and name = 'Salaire'), 1000)$$,
  'P0001', 'Cette catégorie ne correspond pas au type de l’opération.',
  'un budget ne porte pas sur une catégorie de revenu'
);

-- 7. Longueur d'une note écrite
SELECT throws_ok(
  $$update public.transactions set note = repeat('x', 121) where id = '00000000-0000-0000-0000-00000000ad01'$$,
  'P0001', 'La note ne peut pas dépasser 120 caractères.',
  'une note écrite de plus de 120 caractères est toujours refusée'
);

-- 6. Montants entiers
SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, type, amount)
    values ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa02', 'expense', 0.5)$$,
  'P0001', 'Indiquez un montant entier.',
  'un montant décimal est refusé à l''insertion'
);

SELECT throws_ok(
  $$update public.budgets set amount = 1000.5 where id = '00000000-0000-0000-0000-00000000ac01'$$,
  'P0001', 'Indiquez un montant entier.',
  'un plafond décimal est refusé'
);

-- 12. Montant épargné
insert into public.savings_goals (id, user_id, name, target_amount)
values ('00000000-0000-0000-0000-00000000ae01', '00000000-0000-0000-0000-00000000aa02', 'Moto', 500000);

SELECT throws_ok(
  $$update public.savings_goals set current_amount = 400000 where id = '00000000-0000-0000-0000-00000000ae01'$$,
  '42501', NULL,
  'current_amount ne se réécrit pas directement'
);

SELECT lives_ok(
  $$update public.savings_goals set name = 'Moto neuve', target_amount = 600000 where id = '00000000-0000-0000-0000-00000000ae01'$$,
  'le nom et la cible se modifient toujours'
);

-- 11. Rythme au franc
update public.savings_goals set target_amount = 100000, target_date = '2027-01-15' where id = '00000000-0000-0000-0000-00000000ae01';

SELECT is(
  (select monthly_rhythm from public.savings_plans('2026-10-12') where goal_id = '00000000-0000-0000-0000-00000000ae01'),
  33334::numeric,
  'le rythme est arrondi au franc supérieur : 3 × 33 334 atteint 100 000'
);

-- 13. Résurrection
insert into public.transactions (id, group_id, user_id, type, amount)
values ('00000000-0000-0000-0000-00000000ad02', '00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa02', 'expense', 1000);
delete from public.transactions where id = '00000000-0000-0000-0000-00000000ad02';

SELECT throws_ok(
  $$insert into public.transactions (id, group_id, user_id, type, amount)
    values ('00000000-0000-0000-0000-00000000ad02', '00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa02', 'expense', 1000)
    on conflict (id) do nothing$$,
  'P0001', 'Cette opération a été supprimée entre-temps.',
  'le rejeu d''une création ne ressuscite pas une opération supprimée'
);

-- ---------------------------------------------------------------------------
-- En tant qu'Alice, propriétaire
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa01","role":"authenticated"}', true);

-- 4. Code révoqué
insert into public.group_invitations (group_id, created_by, role)
values ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa01', 'member');
update public.group_invitations set revoked_at = now() where group_id = '00000000-0000-0000-0000-00000000ab01';

SELECT throws_ok(
  $$update public.group_invitations set revoked_at = null where group_id = '00000000-0000-0000-0000-00000000ab01'$$,
  'P0001', 'Un code révoqué ne peut pas être réactivé. Générez-en un nouveau.',
  'un code révoqué ne se réactive pas'
);

-- 10. Ajuster au solde réel avec un ancien montant décimal (inséré en postgres, comme avant le passage au FCFA)
set local role postgres;
select set_config('request.jwt.claims', '', true);
insert into public.transactions (group_id, user_id, type, amount)
values ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa01', 'expense', 12.50);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa01","role":"authenticated"}', true);

SELECT lives_ok(
  $$select public.adjust_wallet_balance(
      (select id from public.wallets where group_id = '00000000-0000-0000-0000-00000000ab01' and is_default), 1000)$$,
  'ajuster au solde réel passe malgré un ancien montant décimal'
);

SELECT is(
  (select round(balance) from public.wallets_overview('00000000-0000-0000-0000-00000000ab01') where is_default),
  1000::numeric,
  'le solde affiché (arrondi) est celui demandé'
);

-- 14. filtered_transactions() reste exact avec ses nouvelles bornes
SELECT is(
  (select count(*)::int from public.filtered_transactions('00000000-0000-0000-0000-00000000ab01')),
  (select count(*)::int from public.transactions where group_id = '00000000-0000-0000-0000-00000000ab01'),
  'sans borne, filtered_transactions() rend tout le groupe'
);

SELECT is(
  (select count(*)::int from public.filtered_transactions('00000000-0000-0000-0000-00000000ab01', current_date + 1, null)),
  0,
  'avec une borne de début, les opérations antérieures sont exclues'
);

-- 9. transfer_ownership() revérifie après le verrou : simulé en retirant le rôle d'Alice entre deux appels, comme le ferait une passation concurrente déjà validée.
set local role postgres;
update public.account_memberships set role = 'owner'
 where group_id = '00000000-0000-0000-0000-00000000ab01' and user_id = '00000000-0000-0000-0000-00000000aa02';
update public.account_memberships set role = 'member'
 where group_id = '00000000-0000-0000-0000-00000000ab01' and user_id = '00000000-0000-0000-0000-00000000aa01';
set local role authenticated;

SELECT throws_ok(
  $$select public.transfer_ownership('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa03')$$,
  'P0001', 'Seul le propriétaire du groupe peut passer la main.',
  'un ancien propriétaire ne passe plus la main'
);

set local role postgres;
update public.account_memberships set role = 'owner'
 where group_id = '00000000-0000-0000-0000-00000000ab01' and user_id = '00000000-0000-0000-0000-00000000aa01';
update public.account_memberships set role = 'member'
 where group_id = '00000000-0000-0000-0000-00000000ab01' and user_id = '00000000-0000-0000-0000-00000000aa02';

-- 7. Note héritée trop longue : elle ne bloque plus la suppression du compte de son auteur
-- Une note saisie avant la limite : le trigger est suspendu le temps de la poser, comme la donnée ancienne qu'elle représente.
alter table public.transactions disable trigger transactions_guard_note_length;
insert into public.transactions (group_id, user_id, type, amount, note)
values ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa03', 'expense', 100, repeat('x', 200));
alter table public.transactions enable trigger transactions_guard_note_length;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa03","role":"authenticated"}', true);

SELECT lives_ok(
  $$select public.delete_own_account()$$,
  'une note héritée de plus de 120 caractères ne bloque pas la suppression du compte de son auteur'
);

-- 8. Suppression du propriétaire depuis le tableau de bord
set local role postgres;

SELECT throws_like(
  $$delete from auth.users where id = '00000000-0000-0000-0000-00000000aa01'$$,
  'Groupes partagés dont vous êtes propriétaire%Tontine%',
  'supprimer depuis le tableau de bord la propriétaire d''un groupe peuplé est refusé'
);

SELECT is(
  (select count(*)::int from public.budget_groups where id = '00000000-0000-0000-0000-00000000ab01'),
  1,
  'le groupe et ses données restent aux autres membres'
);

delete from public.account_memberships
 where group_id = '00000000-0000-0000-0000-00000000ab01' and user_id <> '00000000-0000-0000-0000-00000000aa01';

SELECT lives_ok(
  $$delete from auth.users where id = '00000000-0000-0000-0000-00000000aa01'$$,
  'une fois seule dans son groupe, la propriétaire peut être supprimée'
);

SELECT * FROM finish();
ROLLBACK;
