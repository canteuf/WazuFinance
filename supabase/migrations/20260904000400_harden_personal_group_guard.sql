-- Rend guard_personal_group_membership() indépendant de l'ordre des cascades.
--
-- Version précédente : sur DELETE, le guard lisait budget_groups.is_personal et
-- levait une exception si le groupe était personnel. Il comptait sur le fait que
-- la ligne parente ait déjà disparu pour laisser passer les suppressions en
-- cascade.
--
-- Cette hypothèse n'est vraie que par accident. PostgreSQL déclenche les actions
-- référentielles dans l'ordre de création des contraintes, et
-- budget_groups_owner_id_fkey se trouve précéder account_memberships_user_id_fkey.
-- Les groupes sont donc supprimés avant les adhésions. Réordonner la création des
-- tables dans une migration inverserait ce comportement et rendrait toute
-- suppression de compte impossible : le guard se déclencherait au milieu de la
-- cascade.
--
-- Le test discriminant est ailleurs : le profil public.users existe-t-il encore ?
-- En cascade, il est déjà supprimé quand le trigger s'exécute. Quand un
-- utilisateur quitte un groupe depuis l'app, il existe. L'invariant ne dépend
-- plus d'un ordre implicite.

create or replace function public.guard_personal_group_membership()
returns trigger
language plpgsql
as $$
declare
  personal boolean;
begin
  if tg_op = 'INSERT' then
    select is_personal into personal
      from public.budget_groups
     where id = new.group_id;

    if personal and exists (
      select 1 from public.account_memberships where group_id = new.group_id
    ) then
      raise exception 'Un compte personnel ne peut avoir qu''un seul membre';
    end if;

    return new;
  end if;

  select is_personal into personal
    from public.budget_groups
   where id = old.group_id;

  -- Profil déjà supprimé : on est dans une cascade de suppression de compte,
  -- pas dans un départ volontaire.
  if personal and exists (
    select 1 from public.users where id = old.user_id
  ) then
    raise exception 'Impossible de quitter son compte personnel';
  end if;

  return old;
end;
$$;
