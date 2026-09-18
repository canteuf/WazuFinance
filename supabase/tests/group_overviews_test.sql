-- Aperçu des groupes : comptes, sommes de plafonds, noms, et ce qu'un non-membre ne voit pas.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(9);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice-o@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', 'bob-o@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', 'carol-o@example.com', '{"display_name": "Carol"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a4', 'dora-o@example.com',  '{"display_name": "Dora"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a5', 'eve-o@example.com',   '{"display_name": "Eve"}'::jsonb);

-- Coloc : Alice propriétaire, puis Bob, Carol et Dora. Quatre membres, pour vérifier que les noms s'arrêtent à trois.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000b1', 'Coloc', '00000000-0000-0000-0000-0000000000a1', false);

insert into public.account_memberships (group_id, user_id, role, created_at) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'owner',  '2026-09-01'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'member', '2026-09-02'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'member', '2026-09-03'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a4', 'member', '2026-09-04');

-- Deux plafonds mensuels et un hebdomadaire dans Coloc : l'hebdomadaire ne doit pas entrer dans la somme.
insert into public.budgets (group_id, category_id, period, amount) values
  ('00000000-0000-0000-0000-0000000000b1',
   (select id from public.categories where group_id is null and name = 'Alimentation'), 'monthly', 400.10),
  ('00000000-0000-0000-0000-0000000000b1',
   (select id from public.categories where group_id is null and name = 'Transport'), 'monthly', 99.90),
  ('00000000-0000-0000-0000-0000000000b1',
   (select id from public.categories where group_id is null and name = 'Loisirs'), 'weekly', 50.00);

-- Un plafond mensuel dans le compte personnel d'Alice : compté pour ce groupe, jamais dans le total commun.
insert into public.budgets (group_id, category_id, period, amount) values
  ((select m.group_id from public.account_memberships m
     join public.budget_groups g on g.id = m.group_id
    where m.user_id = '00000000-0000-0000-0000-0000000000a1' and g.is_personal),
   (select id from public.categories where group_id is null and name = 'Alimentation'), 'monthly', 1000.00);

-- ---------------------------------------------------------------------------
-- Alice, propriétaire de Coloc
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

SELECT is(
  (select count(*)::integer from public.group_overviews()),
  2,
  'Une ligne par groupe de l''appelant : compte personnel et Coloc'
);

SELECT is(
  (select member_count from public.group_overviews()
    where group_id = '00000000-0000-0000-0000-0000000000b1'),
  4,
  'Tous les membres sont comptés'
);

-- La somme exacte en numeric : 400,10 + 99,90 tombe juste sur 500,00, ce qu'une addition en flottants binaires ne garantit pas.
SELECT is(
  (select monthly_budget from public.group_overviews()
    where group_id = '00000000-0000-0000-0000-0000000000b1')::numeric(12,2),
  500.00::numeric(12,2),
  'Seuls les plafonds mensuels sont sommés, exactement'
);

SELECT is(
  (select member_names from public.group_overviews()
    where group_id = '00000000-0000-0000-0000-0000000000b1'),
  array['Alice', 'Bob', 'Carol'],
  'Les trois premiers membres, dans l''ordre d''arrivée'
);

-- Le compte personnel a son propre plafond de 1 000 €, mais n'est commun à personne.
SELECT is(
  (select distinct shared_monthly_total from public.group_overviews())::numeric(12,2),
  500.00::numeric(12,2),
  'Le total commun ignore le compte personnel'
);

SELECT is(
  (select o.monthly_budget from public.group_overviews() o
     join public.budget_groups g on g.id = o.group_id
    where g.is_personal)::numeric(12,2),
  1000.00::numeric(12,2),
  'Le compte personnel garde son propre total'
);

-- ---------------------------------------------------------------------------
-- Eve, étrangère à Coloc
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}', true);

-- security invoker : les policies filtrent tout, rien de Coloc ne fuit — ni sa taille, ni ses montants, ni ses noms.
SELECT is(
  (select count(*)::integer from public.group_overviews()
    where group_id = '00000000-0000-0000-0000-0000000000b1'),
  0,
  'Un non-membre ne voit pas le groupe'
);

-- Eve n'a que son compte personnel, sans plafond : zéro et non NULL.
SELECT is(
  (select distinct shared_monthly_total from public.group_overviews())::numeric(12,2),
  0.00::numeric(12,2),
  'Sans groupe partagé, le total commun vaut zéro et non NULL'
);

set local role anon;

SELECT throws_ok(
  $$select * from public.group_overviews()$$,
  '42501',
  NULL,
  'Un visiteur anonyme ne peut pas appeler la fonction'
);

SELECT * FROM finish();
ROLLBACK;
