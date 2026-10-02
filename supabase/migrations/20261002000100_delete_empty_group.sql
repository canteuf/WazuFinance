-- Un budget partagé quitté par son dernier membre est supprimé.
--
-- Jusqu'ici, un propriétaire seul dans son groupe pouvait le quitter (guard_owner_orphan() ne bloque que s'il reste d'autres membres) : le groupe restait en base sans aucune adhésion. Personne ne pouvait plus le lire (toutes les policies passent par l'adhésion) ni y revenir (join_group_with_code() refuse un groupe sans propriétaire), et rien ne l'effaçait jamais, ce qui contredisait la politique de conservation. L'app demande désormais confirmation en disant que le groupe sera supprimé ; ce trigger vaut aussi pour les versions de l'app qui ne le disent pas.
--
-- pg_trigger_depth() = 1 : seul un départ fait par le client compte. La suppression d'un groupe ou d'un compte retire les adhésions en cascade, plus profond, et n'a pas à passer par ici.
--
-- SECURITY DEFINER : l'adhésion de l'appelant est déjà supprimée quand le trigger s'exécute, donc les policies ne le reconnaissent plus comme membre. La fonction ne supprime qu'un groupe partagé qui n'a plus aucune adhésion.
--
-- Course avec une adhésion simultanée : join_group_with_code() prend un verrou partagé sur l'adhésion du propriétaire. Si l'adhésion passe en premier, le départ attend, puis guard_owner_orphan() voit le nouveau membre et refuse ; si le départ passe en premier, l'adhésion ne trouve plus de propriétaire et est refusée.
--
-- L'ordre des triggers AFTER DELETE sur account_memberships ne compte pas : remember_former_member(), log_activity() et revoke_invitations_on_member_change() ne font rien pour un groupe déjà disparu.

create function public.delete_empty_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if exists (select 1 from public.account_memberships where group_id = old.group_id) then
    return null;
  end if;
  delete from public.budget_groups where id = old.group_id and not is_personal;
  return null;
end;
$$;

revoke all on function public.delete_empty_group() from public, anon, authenticated;

create trigger account_memberships_delete_empty_group
  after delete on public.account_memberships
  for each row execute function public.delete_empty_group();
