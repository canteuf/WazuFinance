-- Wazu Finance — paramètres du compte (écran 8)
--
-- Quatre parties : des privilèges par colonne sur les deux tables que cet écran écrit, une fonction qui dit ce qui bloque une suppression de compte, la suppression elle-même, et la correction d'un défaut de l'écran 7 découvert en préparant celui-ci.

-- ---------------------------------------------------------------------------
-- 1. Privilèges par colonne sur users et budget_groups
-- ---------------------------------------------------------------------------

-- Une policy décide *quelles lignes* ; un privilège décide *quelles colonnes*. Jusqu'ici `authenticated` avait `update` sur toutes les colonnes de ces deux tables, et seules les policies limitaient l'accès : users_update_self laissait donc un utilisateur réécrire son propre users.email par un appel direct à l'API — il se désynchronisait alors de auth.users, qui reste la source de vérité —, et budget_groups_update_owner laissait un propriétaire changer owner_id ou is_personal de son groupe.
--
-- L'app n'a jamais écrit ces colonnes ; rien ne l'en empêchait. Cet écran est le premier à écrire dans ces tables, d'où le moment choisi pour fermer.

revoke update on public.users from authenticated;
grant update (display_name) on public.users to authenticated;

-- `name` reste modifiable bien qu'aucun écran ne le fasse aujourd'hui : c'est une donnée d'affichage comme display_name, et la retirer ne protégerait rien.
revoke update on public.budget_groups from authenticated;
grant update (name, period_start_day) on public.budget_groups to authenticated;

-- Les actions référentielles (on delete cascade, on delete set null) s'exécutent avec les droits du propriétaire des tables et ne sont pas concernées par ces revoke. Les fonctions SECURITY DEFINER existantes non plus.

-- ---------------------------------------------------------------------------
-- 2. owned_groups_with_other_members() — ce qui bloque une suppression
-- ---------------------------------------------------------------------------

-- Les groupes partagés dont l'appelant est propriétaire et qui comptent encore d'autres membres. Une seule définition, utilisée deux fois : par l'écran, pour désactiver le bouton et nommer les groupes en cause, et par delete_own_account(), pour refuser. Deux définitions du même « ce qui bloque » finiraient par diverger.
--
-- SECURITY INVOKER : la fonction lit account_memberships depuis l'extérieur de toute policy, donc sans récursion — même raisonnement que period_summary(). RLS s'applique telle quelle et suffit : account_memberships_select_member laisse l'appelant voir toutes les adhésions des groupes dont il est membre, ce qu'interroge exactement le `exists`.
--
-- Le propriétaire est repéré par son adhésion `role = 'owner'`, comme dans guard_owner_orphan(), et non par budget_groups.owner_id : les deux coïncident dans tout ce que l'app produit, et c'est l'adhésion qui décide des droits.
create function public.owned_groups_with_other_members()
returns table (id uuid, name text)
language sql
stable
security invoker
set search_path = public
as $$
  select g.id, g.name
    from public.budget_groups g
    join public.account_memberships own
      on own.group_id = g.id
     and own.user_id = auth.uid()
     and own.role = 'owner'
   where not g.is_personal
     and exists (
       select 1 from public.account_memberships m
        where m.group_id = g.id and m.user_id <> auth.uid()
     )
   order by g.name;
$$;

revoke all on function public.owned_groups_with_other_members() from public, anon;
grant execute on function public.owned_groups_with_other_members() to authenticated;

comment on function public.owned_groups_with_other_members() is
  'Groupes partagés possédés par l''appelant qui ont encore d''autres membres : ceux qui empêchent la suppression de son compte.';

-- ---------------------------------------------------------------------------
-- 3. delete_own_account() — suppression de son propre compte
-- ---------------------------------------------------------------------------

-- Ferme l'échappatoire laissée ouverte par l'écran 7 : guard_owner_orphan() ne bloque qu'à pg_trigger_depth() = 1, donc un propriétaire pouvait quitter un groupe peuplé en supprimant son compte, la cascade s'exécutant plus profond. La vérification a lieu ici, avant toute suppression, et non dans un trigger : au milieu d'une cascade, un trigger ne peut pas distinguer le départ voulu de la conséquence d'autre chose.
--
-- SECURITY DEFINER pour une raison qui lui est propre, pas par imitation des helpers d'appartenance : un client n'a, et ne doit avoir, aucun droit sur auth.users. Vérifié sur la pile locale comme sur le projet hébergé : `postgres` n'y est pas superutilisateur, mais détient DELETE sur auth.users, qui appartient à supabase_auth_admin — les cascades vers les tables internes d'Auth s'exécutent avec les droits de ce propriétaire. Aucune Edge Function n'est donc nécessaire.
--
-- Appelée d'ici, owned_groups_with_other_members() s'exécute avec les droits du propriétaire et échappe à RLS ; elle filtre explicitement sur auth.uid(), qui reste celui de l'appelant, donc le résultat est le même.
create function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_blocking text;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  select string_agg(format('« %s »', b.name), ', ' order by b.name)
    into v_blocking
    from public.owned_groups_with_other_members() b;

  -- Message neutre en nombre : il remonte en P0001, que data-errors.ts affiche verbatim faute de pouvoir distinguer plusieurs messages partageant ce code.
  if v_blocking is not null then
    raise exception 'Groupes partagés dont vous êtes propriétaire et qui ont encore d''autres membres : %. Excluez ces membres avant de supprimer votre compte.', v_blocking;
  end if;

  -- Supprimées explicitement avant le compte, pour que le journal les attribue au membre : pendant la cascade, sa ligne `users` a déjà disparu et log_activity() les enregistrerait sans auteur. Seuls les groupes qui lui survivent sont concernés — ceux dont il est propriétaire partent entiers, et log_activity() n'y journalise rien puisque le groupe n'existe plus.
  delete from public.transactions t
   where t.user_id = v_uid
     and exists (
       select 1 from public.account_memberships m
        where m.group_id = t.group_id
          and m.user_id <> v_uid
     );

  -- Tout le reste part par les cascades déjà en place : le profil users, le compte personnel et son contenu, les groupes partagés dont il est propriétaire (forcément seul membre à ce stade), ses adhésions, ses objectifs d'épargne, les invitations qu'il a créées. Les entrées de journal qu'il a écrites survivent à son nom, sans actor_id.
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

comment on function public.delete_own_account() is
  'Supprime le compte de l''appelant, après avoir refusé s''il possède un groupe partagé peuplé.';

-- ---------------------------------------------------------------------------
-- 4. join_group_with_code() — un groupe sans propriétaire ne peut plus être rejoint
-- ---------------------------------------------------------------------------

-- Défaut de l'écran 7, découvert en préparant celui-ci. Quand le propriétaire quitte un groupe dont il est le seul membre — cas autorisé —, une invitation encore valide restait utilisable : l'invité rejoignait un groupe sans propriétaire, que personne ne pouvait plus gérer, et dont owner_id désignait quelqu'un qui n'en était plus membre. La suppression du compte de cet ancien propriétaire emportait ensuite le groupe par la cascade sur owner_id, invité compris.
--
-- Le contrôle vit dans la RPC, seul chemin d'entrée dans un groupe, plutôt que dans une révocation des invitations au départ du dernier membre : il couvre aussi un propriétaire qui se serait rétrogradé seul par un appel direct à l'API, et il ne dépend d'aucun état d'invitation.
--
-- Corps identique à celui de 20260904000200_policies.sql, plus le bloc `perform`. create or replace conserve les privilèges déjà posés.
create or replace function public.join_group_with_code(invitation_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.group_invitations;
  personal   boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  select * into invitation
    from public.group_invitations
   where code = invitation_code
     for update;

  if not found then
    raise exception 'Invitation introuvable';
  end if;
  if invitation.revoked_at is not null then
    raise exception 'Invitation révoquée';
  end if;
  if invitation.used_at is not null then
    raise exception 'Invitation déjà utilisée';
  end if;
  if invitation.expires_at <= now() then
    raise exception 'Invitation expirée';
  end if;

  select is_personal into personal
    from public.budget_groups
   where id = invitation.group_id;

  if personal then
    raise exception 'Un compte personnel ne peut pas être rejoint';
  end if;

  -- Verrou partagé, qui ferme la course entre un départ et une arrivée simultanés : le delete du propriétaire qui part attend la fin de cette transaction, puis guard_owner_orphan() — dont la requête prend un nouvel instantané — voit le nouveau membre et bloque le départ. Si le départ passe en premier, ce perform ne trouve plus d'adhésion owner et l'adhésion est refusée.
  perform 1
     from public.account_memberships
    where group_id = invitation.group_id
      and role = 'owner'
      for share;

  if not found then
    raise exception 'Ce groupe n''a plus de propriétaire : il ne peut plus être rejoint';
  end if;

  insert into public.account_memberships (group_id, user_id, role)
  values (invitation.group_id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  update public.group_invitations
     set used_at = now(),
         used_by = auth.uid()
   where id = invitation.id;

  return invitation.group_id;
end;
$$;
