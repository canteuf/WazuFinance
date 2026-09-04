-- Wazu Finance — Row Level Security (spec 4.1)
--
-- La règle unique : un utilisateur ne voit et ne modifie que les données des
-- budget_groups dont il est membre. Comme le compte personnel est lui-même un
-- groupe, cette règle couvre le perso et le partagé sans branche séparée.
--
-- Les helpers ci-dessous sont SECURITY DEFINER : ils lisent account_memberships
-- en contournant RLS. Sans cela, une policy sur account_memberships qui
-- interroge account_memberships déclencherait une récursion infinie.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.account_memberships m
     where m.group_id = gid
       and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.account_memberships m
     where m.group_id = gid
       and m.user_id = auth.uid()
       and m.role = 'owner'
  );
$$;

-- Deux utilisateurs partagent-ils au moins un groupe ? Sert à autoriser
-- l'affichage du nom des autres membres.
create or replace function public.shares_group_with(other_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.account_memberships mine
      join public.account_memberships theirs
        on theirs.group_id = mine.group_id
     where mine.user_id = auth.uid()
       and theirs.user_id = other_user_id
  );
$$;

revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.is_group_owner(uuid) from public, anon;
revoke all on function public.shares_group_with(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.shares_group_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Invariant : un compte personnel reste à un seul membre
-- ---------------------------------------------------------------------------

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

  -- En cascade depuis la suppression du groupe, la ligne parente n'existe
  -- déjà plus : personal vaut NULL et la suppression passe.
  select is_personal into personal
    from public.budget_groups
   where id = old.group_id;

  if personal then
    raise exception 'Impossible de quitter son compte personnel';
  end if;

  return old;
end;
$$;

create trigger account_memberships_guard_personal
  before insert or delete on public.account_memberships
  for each row execute function public.guard_personal_group_membership();

-- ---------------------------------------------------------------------------
-- Rejoindre un groupe par code d'invitation
--
-- Passe par une fonction plutôt qu'un INSERT direct : le futur membre n'a, par
-- définition, pas encore le droit de lire la table des invitations du groupe.
-- ---------------------------------------------------------------------------

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

revoke all on function public.join_group_with_code(text) from public, anon;
grant execute on function public.join_group_with_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Activation de RLS
-- ---------------------------------------------------------------------------

alter table public.users               enable row level security;
alter table public.budget_groups       enable row level security;
alter table public.account_memberships enable row level security;
alter table public.categories          enable row level security;
alter table public.transactions        enable row level security;
alter table public.budgets             enable row level security;
alter table public.savings_goals       enable row level security;
alter table public.group_invitations   enable row level security;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

-- Pas de policy INSERT : le profil est créé par le trigger d'inscription.
create policy "users_select_self_or_covisible"
  on public.users for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));

create policy "users_update_self"
  on public.users for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- budget_groups
-- ---------------------------------------------------------------------------

create policy "budget_groups_select_member"
  on public.budget_groups for select to authenticated
  using (public.is_group_member(id));

-- Le groupe personnel est créé par le trigger d'inscription, jamais par l'app.
create policy "budget_groups_insert_shared"
  on public.budget_groups for insert to authenticated
  with check (owner_id = (select auth.uid()) and is_personal = false);

create policy "budget_groups_update_owner"
  on public.budget_groups for update to authenticated
  using (public.is_group_owner(id))
  with check (public.is_group_owner(id));

create policy "budget_groups_delete_owner"
  on public.budget_groups for delete to authenticated
  using (public.is_group_owner(id) and is_personal = false);

-- ---------------------------------------------------------------------------
-- account_memberships
-- ---------------------------------------------------------------------------

create policy "account_memberships_select_member"
  on public.account_memberships for select to authenticated
  using (public.is_group_member(group_id));

create policy "account_memberships_insert_owner"
  on public.account_memberships for insert to authenticated
  with check (public.is_group_owner(group_id));

create policy "account_memberships_update_owner"
  on public.account_memberships for update to authenticated
  using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));

-- Un propriétaire exclut un membre ; un membre quitte le groupe lui-même.
create policy "account_memberships_delete_owner_or_self"
  on public.account_memberships for delete to authenticated
  using (public.is_group_owner(group_id) or user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- categories — group_id NULL = catégorie par défaut, lecture seule
-- ---------------------------------------------------------------------------

create policy "categories_select_default_or_member"
  on public.categories for select to authenticated
  using (group_id is null or public.is_group_member(group_id));

create policy "categories_insert_member"
  on public.categories for insert to authenticated
  with check (group_id is not null and public.is_group_member(group_id));

create policy "categories_update_member"
  on public.categories for update to authenticated
  using (group_id is not null and public.is_group_member(group_id))
  with check (group_id is not null and public.is_group_member(group_id));

create policy "categories_delete_member"
  on public.categories for delete to authenticated
  using (group_id is not null and public.is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------

create policy "transactions_select_member"
  on public.transactions for select to authenticated
  using (public.is_group_member(group_id));

create policy "transactions_insert_member"
  on public.transactions for insert to authenticated
  with check (public.is_group_member(group_id) and user_id = (select auth.uid()));

-- Dans un budget partagé, tout membre peut corriger une ligne du groupe.
create policy "transactions_update_member"
  on public.transactions for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

create policy "transactions_delete_member"
  on public.transactions for delete to authenticated
  using (public.is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------------

create policy "budgets_select_member"
  on public.budgets for select to authenticated
  using (public.is_group_member(group_id));

create policy "budgets_insert_member"
  on public.budgets for insert to authenticated
  with check (public.is_group_member(group_id));

create policy "budgets_update_member"
  on public.budgets for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

create policy "budgets_delete_member"
  on public.budgets for delete to authenticated
  using (public.is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- savings_goals — rattachés à un utilisateur, jamais partagés (spec 3)
-- ---------------------------------------------------------------------------

create policy "savings_goals_all_own"
  on public.savings_goals for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- group_invitations — lecture réservée aux membres ; le futur membre passe par
-- join_group_with_code()
-- ---------------------------------------------------------------------------

create policy "group_invitations_select_member"
  on public.group_invitations for select to authenticated
  using (public.is_group_member(group_id));

create policy "group_invitations_insert_owner"
  on public.group_invitations for insert to authenticated
  with check (
    public.is_group_owner(group_id)
    and created_by = (select auth.uid())
    and expires_at > now()
  );

-- Révocation = UPDATE de revoked_at par un propriétaire.
create policy "group_invitations_update_owner"
  on public.group_invitations for update to authenticated
  using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));

create policy "group_invitations_delete_owner"
  on public.group_invitations for delete to authenticated
  using (public.is_group_owner(group_id));

-- ---------------------------------------------------------------------------
-- Privilèges — rien n'est accessible sans session authentifiée
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;

grant select, insert, update, delete on
  public.budget_groups,
  public.account_memberships,
  public.categories,
  public.transactions,
  public.budgets,
  public.savings_goals,
  public.group_invitations
to authenticated;

grant select, update on public.users to authenticated;
