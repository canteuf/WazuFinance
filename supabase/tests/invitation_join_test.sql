-- join_group_with_code() : réponse unique à un code refusé, limite de tentatives, saisie normalisée (migration harden_group_access).
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(12);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001a1', 'alice-j@example.com',   '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000001a2', 'bob-j@example.com',     '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000001a3', 'mallory-j@example.com', '{"display_name": "Mallory"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000001b1', 'Famille', '00000000-0000-0000-0000-0000000001a1', false);

insert into public.account_memberships (group_id, user_id, role)
values ('00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-0000000001a1', 'owner');

insert into public.group_invitations (group_id, code, created_by, expires_at, revoked_at, used_at) values
  ('00000000-0000-0000-0000-0000000001b1', '7KQ2M9XA', '00000000-0000-0000-0000-0000000001a1', now() + interval '7 days', null, null),
  ('00000000-0000-0000-0000-0000000001b1', 'REVOKED2', '00000000-0000-0000-0000-0000000001a1', now() + interval '7 days', now(), null),
  ('00000000-0000-0000-0000-0000000001b1', 'EXPIRED2', '00000000-0000-0000-0000-0000000001a1', now() - interval '1 day', null, null),
  ('00000000-0000-0000-0000-0000000001b1', 'USEDUSED', '00000000-0000-0000-0000-0000000001a1', now() + interval '7 days', null, now());

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Un code refusé donne toujours la même réponse
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}', true);

SELECT is(public.join_group_with_code('ZZZZZZZZ'), NULL, 'Un code inconnu renvoie NULL');
SELECT is(public.join_group_with_code('REVOKED2'), NULL, 'Un code révoqué renvoie NULL, comme un code inconnu');
SELECT is(public.join_group_with_code('EXPIRED2'), NULL, 'Un code expiré renvoie NULL, comme un code inconnu');
-- Un code sert à plusieurs personnes jusqu'à son échéance (20260927000200_group_roles.sql) : déjà utilisé par quelqu'un d'autre, il reste valable.
SELECT is(
  public.join_group_with_code('USEDUSED'),
  '00000000-0000-0000-0000-0000000001b1'::uuid,
  'Un code déjà utilisé par un autre reste valable jusqu''à son échéance'
);

-- ---------------------------------------------------------------------------
-- Saisie normalisée : minuscules, tiret et espaces acceptés
-- ---------------------------------------------------------------------------

-- Bob est déjà membre par le code précédent : la fonction rend le groupe sans rien changer.
SELECT is(
  public.join_group_with_code(' 7kq2-m9xa '),
  '00000000-0000-0000-0000-0000000001b1'::uuid,
  'Un code recopié tel qu''il s''affiche, en minuscules et avec tiret, est reconnu'
);

SELECT is(
  (select count(*)::int from public.account_memberships
    where group_id = '00000000-0000-0000-0000-0000000001b1'
      and user_id = '00000000-0000-0000-0000-0000000001a2'
      and role = 'member'),
  1,
  'Bob a rejoint Famille comme simple membre'
);

-- ---------------------------------------------------------------------------
-- Limite de tentatives : dix échecs par heure et par utilisateur
-- ---------------------------------------------------------------------------

SELECT throws_ok(
  $$select count(*) from public.invitation_attempts$$,
  '42501',
  NULL,
  'Un client ne lit pas la table des tentatives'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000001a3","role":"authenticated"}', true);

-- Neuf échecs : Mallory reste sous la limite.
select public.join_group_with_code('BADCODE' || n) from generate_series(1, 9) as n;
SELECT is(public.join_group_with_code('BADCODEA'), NULL, 'Le dixième échec renvoie encore NULL');

SELECT throws_ok(
  $$select public.join_group_with_code('7KQ2M9XA')$$,
  'P0001',
  'Trop de codes erronés. Réessayez dans une heure.',
  'Au-delà de dix échecs en une heure, même un code valide est refusé'
);

-- La limite est propre à chaque utilisateur : Bob n'est pas bloqué par les essais de Mallory.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}', true);

SELECT is(public.join_group_with_code('ZZZZZZZY'), NULL, 'Bob peut encore essayer un code');

-- Les échecs de plus d'une heure ne comptent plus.
set local role postgres;
update public.invitation_attempts
   set attempted_at = now() - interval '2 hours'
 where user_id = '00000000-0000-0000-0000-0000000001a3';
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000001a3","role":"authenticated"}', true);

SELECT is(public.join_group_with_code('ZZZZZZZX'), NULL, 'Une heure plus tard, Mallory peut réessayer');

set local role postgres;

SELECT is(
  (select count(*)::int from public.invitation_attempts
    where user_id = '00000000-0000-0000-0000-0000000001a3'),
  1,
  'Le nouvel échec purge les tentatives de plus d''une heure'
);

SELECT * FROM finish();
ROLLBACK;
