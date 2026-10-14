-- Voir le groupe avant de le rejoindre.
--
-- L'écran « Rejoindre » faisait entrer dans le groupe dès la validation du code, sans dire lequel, et en faisait le groupe actif. Un lien reçu sur WhatsApp suffisait : quelqu'un qui se faisait passer pour le trésorier d'une tontine envoyait un code de son propre groupe, la personne y entrait sans le savoir, et ce qu'elle saisissait ensuite en croyant être dans son budget — montants, notes, son nom — était lu par l'expéditeur (audit du 12 octobre 2026). L'app montre désormais le nom du groupe, de son propriétaire et le rôle offert, et demande une confirmation.
--
-- preview_invitation() renvoie ces informations pour un code valide, et rien pour un code inconnu, révoqué ou expiré. Elle partage le compteur d'essais de join_group_with_code(), sous le même verrou par utilisateur : sans cela, elle aurait servi à deviner des codes sans limite. Une erreur de code compte comme une tentative ; un code valide ne compte pas.
--
-- SECURITY DEFINER : l'appelant n'est pas encore membre, il ne peut lire ni l'invitation, ni le groupe, ni ses membres. Elle n'expose que le nom du groupe, le nom affiché de son propriétaire, le nombre de membres et le rôle — ce que le propriétaire a choisi de partager en envoyant le code.
create function public.preview_invitation(invitation_code text)
returns table (group_name text, owner_name text, member_count integer, role public.membership_role, already_member boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_code     text := upper(regexp_replace(coalesce(invitation_code, ''), '[^0-9A-Za-z]', '', 'g'));
  invitation public.group_invitations;
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
   where code = v_code;

  if not found
     or invitation.revoked_at is not null
     or invitation.expires_at <= now()
     or exists (select 1 from public.budget_groups g where g.id = invitation.group_id and g.is_personal) then
    delete from public.invitation_attempts
     where user_id = v_uid
       and attempted_at <= now() - interval '1 hour';
    insert into public.invitation_attempts (user_id) values (v_uid);
    return;
  end if;

  -- Colonnes qualifiées : `role` est aussi le nom d'une colonne rendue par la fonction.
  if not exists (
    select 1 from public.account_memberships m
     where m.group_id = invitation.group_id and m.role = 'owner'
  ) then
    raise exception 'Ce groupe n''a plus de propriétaire : il ne peut plus être rejoint';
  end if;

  return query
    select g.name,
           (select u.display_name
              from public.account_memberships m
              join public.users u on u.id = m.user_id
             where m.group_id = g.id and m.role = 'owner'
             limit 1),
           (select count(*)::integer from public.account_memberships m where m.group_id = g.id),
           invitation.role,
           exists (select 1 from public.account_memberships m where m.group_id = g.id and m.user_id = v_uid)
      from public.budget_groups g
     where g.id = invitation.group_id;
end;
$$;
revoke all on function public.preview_invitation(text) from public, anon;
grant execute on function public.preview_invitation(text) to authenticated;
