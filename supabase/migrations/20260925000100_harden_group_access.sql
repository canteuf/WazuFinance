-- Wazu Finance — durcissement de l'entrée dans les groupes
--
-- Deux défauts relevés par l'audit de sécurité du 2026-09-25 :
--   1. un propriétaire pouvait inscrire n'importe quel utilisateur dans son groupe, avec n'importe quel rôle ;
--   2. le code d'invitation (32 bits) se devinait par essais répétés, sans limite, et le message d'erreur disait si un code existait.

-- ---------------------------------------------------------------------------
-- 1. account_memberships — plus aucune insertion ni modification directe
-- ---------------------------------------------------------------------------

-- account_memberships_insert_owner ne vérifiait que is_group_owner(group_id), jamais user_id ni role : n'importe qui pouvait créer un groupe par create_shared_group(), puis y inscrire un autre utilisateur, sans son accord, comme membre ou comme propriétaire. La victime devenait alors « co-visible » et users_select_self_or_covisible livrait son e-mail ; inscrite propriétaire d'un groupe peuplé, elle ne pouvait plus non plus supprimer son compte (owned_groups_with_other_members()).
--
-- L'app n'a jamais écrit dans cette table autrement que par les fonctions SECURITY DEFINER (handle_new_user, create_shared_group, join_group_with_code), qui s'exécutent avec les droits de leur propriétaire et ne sont pas concernées par ce revoke. Le changement de rôle n'a pas d'écran en V1 : account_memberships_update_owner ne servait à rien et ouvrait la même porte. Le jour où il en faudra un, ce sera une fonction qui ne touche que `role`.
--
-- Le delete reste ouvert : exclure un membre et quitter un groupe passent par account_memberships_delete_owner_or_self, gardée par guard_owner_orphan().

drop policy "account_memberships_insert_owner" on public.account_memberships;
drop policy "account_memberships_update_owner" on public.account_memberships;

revoke insert, update on public.account_memberships from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Code d'invitation — alphabet sans ambiguïté, généré en base
-- ---------------------------------------------------------------------------

-- Huit caractères pris dans 32 symboles : les chiffres 2 à 9 et les lettres sans I ni O, qui se confondent avec 1 et 0 à la lecture ou à la dictée. 40 bits au lieu de 32, en gardant les huit cases de l'écran de saisie. La longueur seule ne suffit pas à arrêter un essai systématique : c'est la limite de tentatives de join_group_with_code(), plus bas, qui le fait.
--
-- 256 est un multiple de 32 : `octet % 32` tire chaque symbole avec la même probabilité.
create function public.generate_invitation_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  bytes bytea := extensions.gen_random_bytes(8);
  result text := '';
begin
  for i in 0..7 loop
    result := result || substr(alphabet, get_byte(bytes, i) % 32 + 1, 1);
  end loop;
  return result;
end;
$$;

-- Évaluée comme valeur par défaut d'un insert fait par le client : authenticated doit pouvoir l'exécuter.
revoke all on function public.generate_invitation_code() from public, anon;
grant execute on function public.generate_invitation_code() to authenticated;

alter table public.group_invitations
  alter column code set default public.generate_invitation_code(),
  -- L'échéance est fixée par la base, et non plus par l'horloge du téléphone : un client ne choisit plus la durée de vie de son invitation.
  alter column expires_at set default now() + interval '7 days';

-- Les invitations encore actives portent un code de l'ancien format (hexadécimal, 32 bits) : elles sont révoquées plutôt que laissées devinables jusqu'à leur échéance. Le propriétaire en génère une nouvelle depuis l'écran du groupe.
update public.group_invitations
   set revoked_at = now()
 where revoked_at is null
   and used_at is null
   and expires_at > now()
   and code !~ '^[2-9A-HJ-NP-Z]{8}$';

-- ---------------------------------------------------------------------------
-- 3. group_invitations — privilèges par colonne
-- ---------------------------------------------------------------------------

-- Une policy décide quelles lignes, un privilège quelles colonnes (même principe que 20260919000100_account_settings.sql). Jusqu'ici un propriétaire pouvait, par un appel direct à l'API, choisir un code trivial, une échéance à cent ans, ou remettre used_at à zéro pour réutiliser une invitation. Le client ne fournit plus que le groupe et son propre id ; il ne modifie que revoked_at.
revoke insert, update on public.group_invitations from authenticated;
grant insert (group_id, created_by) on public.group_invitations to authenticated;
grant update (revoked_at) on public.group_invitations to authenticated;

-- ---------------------------------------------------------------------------
-- 4. join_group_with_code() — réponse unique et nombre d'essais limité
-- ---------------------------------------------------------------------------

-- Tentatives manquées, une ligne par échec. Aucune policy ni aucun privilège : seule join_group_with_code(), SECURITY DEFINER, y lit et y écrit.
create table public.invitation_attempts (
  user_id      uuid not null references public.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index invitation_attempts_user_idx on public.invitation_attempts (user_id, attempted_at desc);

alter table public.invitation_attempts enable row level security;

-- Les privilèges par défaut de Supabase donnent toute nouvelle table du schéma public à anon et authenticated. RLS sans policy n'y laisserait lire aucune ligne ; le revoke rend l'intention explicite et refuse la requête elle-même.
revoke all on public.invitation_attempts from anon, authenticated;

-- Un code inconnu, révoqué, déjà utilisé ou expiré donne la même réponse : NULL, que l'app affiche comme « code invalide ou expiré ». Distinguer les cas disait à un attaquant quels codes existent.
--
-- NULL plutôt qu'une exception : une exception annule toute la transaction, y compris la ligne d'invitation_attempts qui compte l'échec — le compteur ne progresserait jamais. La fonction se termine donc normalement sur un échec, et l'enregistrement de la tentative est validé avec elle.
--
-- Dix échecs par heure et par utilisateur : de quoi se tromper plusieurs fois en recopiant un code, pas de quoi en parcourir 2^40. Le verrou consultatif sérialise les appels d'un même utilisateur : sans lui, des requêtes parallèles liraient toutes le même compteur avant qu'aucune n'y écrive, et passeraient ensemble sous la limite.
--
-- Deux refus restent des exceptions à message propre, parce qu'ils ne concernent qu'un code valide — ils n'apprennent rien à qui essaie des codes au hasard : un compte personnel, et un groupe resté sans propriétaire (20260919000100_account_settings.sql).
--
-- La saisie est normalisée ici plutôt que chez le client seul : majuscules, sans tiret ni espace. Un code recopié tel qu'il s'affiche (« 7KQ2-M9XA ») est reconnu, quelle que soit la version de l'app.
create or replace function public.join_group_with_code(invitation_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_code     text := upper(regexp_replace(coalesce(invitation_code, ''), '[^0-9A-Za-z]', '', 'g'));
  invitation public.group_invitations;
  personal   boolean;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('join_group_with_code:' || v_uid::text, 0));

  if (select count(*) from public.invitation_attempts
       where user_id = v_uid
         and attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de codes erronés. Réessayez dans une heure.';
  end if;

  select * into invitation
    from public.group_invitations
   where code = v_code
     for update;

  if not found
     or invitation.revoked_at is not null
     or invitation.used_at is not null
     or invitation.expires_at <= now() then
    -- Le ménage des tentatives anciennes se fait ici, au seul endroit où la table grossit.
    delete from public.invitation_attempts
     where user_id = v_uid
       and attempted_at <= now() - interval '1 hour';
    insert into public.invitation_attempts (user_id) values (v_uid);
    return null;
  end if;

  select is_personal into personal
    from public.budget_groups
   where id = invitation.group_id;

  if personal then
    raise exception 'Un compte personnel ne peut pas être rejoint';
  end if;

  -- Verrou partagé contre un départ simultané du propriétaire : voir 20260919000100_account_settings.sql.
  perform 1
     from public.account_memberships
    where group_id = invitation.group_id
      and role = 'owner'
      for share;

  if not found then
    raise exception 'Ce groupe n''a plus de propriétaire : il ne peut plus être rejoint';
  end if;

  insert into public.account_memberships (group_id, user_id, role)
  values (invitation.group_id, v_uid, 'member')
  on conflict (group_id, user_id) do nothing;

  update public.group_invitations
     set used_at = now(),
         used_by = v_uid
   where id = invitation.id;

  return invitation.group_id;
end;
$$;

comment on function public.join_group_with_code(text) is
  'Rejoint le groupe de l''invitation. NULL si le code est inconnu, révoqué, utilisé ou expiré ; au-delà de dix échecs en une heure, refus.';
