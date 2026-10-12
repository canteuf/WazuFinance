-- Durcissement issu de l'audit du 12 octobre 2026. Chaque section corrige un défaut prouvé sur la pile locale ; les tests sont dans supabase/tests/audit_hardening_test.sql.

-- ---------------------------------------------------------------------------
-- 1. Index des clés étrangères
-- ---------------------------------------------------------------------------

-- Sans index, chaque ligne supprimée par une cascade (compte, groupe, opération) fait un parcours complet de la table qui la référence. Mesuré sur 330 000 opérations et 50 000 transferts : supprimer un compte de 300 opérations prenait 1,3 s, contre 0,1 s avec ces index ; le temps grandissait avec la base entière et aurait fini par dépasser le délai de 8 s du rôle authenticated.
create index wallet_transfers_fee_transaction_id_idx on public.wallet_transfers (fee_transaction_id) where fee_transaction_id is not null;
create index wallet_transfers_from_wallet_id_idx on public.wallet_transfers (from_wallet_id);
create index wallet_transfers_to_wallet_id_idx on public.wallet_transfers (to_wallet_id);
create index wallet_transfers_user_id_idx on public.wallet_transfers (user_id);
create index transactions_user_id_idx on public.transactions (user_id);
create index activity_log_actor_id_idx on public.activity_log (actor_id);
create index budgets_category_id_idx on public.budgets (category_id);
create index recurring_transactions_category_id_idx on public.recurring_transactions (category_id);
create index recurring_transactions_user_id_idx on public.recurring_transactions (user_id);
create index recurring_transactions_wallet_id_idx on public.recurring_transactions (wallet_id);
create index debts_user_id_idx on public.debts (user_id);
create index group_invitations_created_by_idx on public.group_invitations (created_by);
create index group_invitations_used_by_idx on public.group_invitations (used_by);

-- ---------------------------------------------------------------------------
-- 2. created_at et updated_at fixés par la base à l'insertion
-- ---------------------------------------------------------------------------

-- touch_updated_at() et guard_immutable_columns() ne couvrent que l'UPDATE. Un membre pouvait insérer une opération avec created_at = 2999-01-01, puis la modifier : updated_at < created_at, et la mention « modifié » n'apparaissait jamais. Seules les écritures d'un utilisateur sont concernées (auth.uid() non NULL) : une reprise de données faite en tant que postgres garde ses dates.
create function public.force_server_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.created_at := now();
    new.updated_at := new.created_at;
  end if;
  return new;
end;
$$;
revoke all on function public.force_server_timestamps() from public, anon, authenticated;

create trigger transactions_force_server_timestamps before insert on public.transactions
  for each row execute function public.force_server_timestamps();
create trigger budgets_force_server_timestamps before insert on public.budgets
  for each row execute function public.force_server_timestamps();
create trigger savings_goals_force_server_timestamps before insert on public.savings_goals
  for each row execute function public.force_server_timestamps();
create trigger debts_force_server_timestamps before insert on public.debts
  for each row execute function public.force_server_timestamps();
create trigger wallets_force_server_timestamps before insert on public.wallets
  for each row execute function public.force_server_timestamps();
create trigger recurring_transactions_force_server_timestamps before insert on public.recurring_transactions
  for each row execute function public.force_server_timestamps();

-- ---------------------------------------------------------------------------
-- 3. Un groupe ne se crée que par create_shared_group()
-- ---------------------------------------------------------------------------

-- La policy d'insertion d'origine était restée : un POST direct sur budget_groups créait un groupe sans aucune adhésion, avec son portefeuille, que personne ne pouvait plus lire ni supprimer. create_shared_group() et handle_new_user() sont SECURITY DEFINER et n'en ont pas besoin.
drop policy if exists "budget_groups_insert_shared" on public.budget_groups;
revoke insert on public.budget_groups from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Un code révoqué le reste
-- ---------------------------------------------------------------------------

-- grant update (revoked_at) laissait remettre revoked_at à NULL : un propriétaire réactivait le code qu'avait vu la personne qu'il venait d'exclure, alors que revoke_invitations_on_member_change() venait de le révoquer.
create function public.guard_invitation_revocation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'Un code révoqué ne peut pas être réactivé. Générez-en un nouveau.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_invitation_revocation() from public, anon, authenticated;

create trigger group_invitations_guard_revocation before update of revoked_at on public.group_invitations
  for each row execute function public.guard_invitation_revocation();

-- ---------------------------------------------------------------------------
-- 5. Le type de l'opération suit celui de sa catégorie
-- ---------------------------------------------------------------------------

-- check_category_group() vérifiait le groupe, pas le type : une dépense rangée dans « Salaire » entrait dans category_breakdown, et un budget pouvait porter sur une catégorie de revenu. La vérification court aussi quand seul le type change. Les budgets n'ont pas de colonne type : leur catégorie doit être une catégorie de dépense.
create or replace function public.check_category_group()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_type public.transaction_type := coalesce((to_jsonb(new) ->> 'type')::public.transaction_type, 'expense');
begin
  if new.category_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.category_id is not distinct from old.category_id
     and (to_jsonb(new) ->> 'type') is not distinct from (to_jsonb(old) ->> 'type') then
    return new;
  end if;
  if not exists (
    select 1
    from public.categories c
    where c.id = new.category_id
      and (c.group_id is null or c.group_id = new.group_id)
  ) then
    raise exception 'Cette catégorie n’appartient pas à ce budget.';
  end if;
  if not exists (select 1 from public.categories c where c.id = new.category_id and c.type = v_type) then
    raise exception 'Cette catégorie ne correspond pas au type de l’opération.';
  end if;
  return new;
end;
$$;

drop trigger transactions_check_category_group on public.transactions;
create trigger transactions_check_category_group
  before insert or update of category_id, type on public.transactions
  for each row execute function public.check_category_group();

drop trigger recurring_transactions_check_category_group on public.recurring_transactions;
create trigger recurring_transactions_check_category_group
  before insert or update of category_id, type on public.recurring_transactions
  for each row execute function public.check_category_group();

-- ---------------------------------------------------------------------------
-- 6. Montants entiers
-- ---------------------------------------------------------------------------

-- Le franc CFA n'a pas de centimes, mais transactions, budgets et savings_goals acceptaient 0,50 par l'API. Les fonctions SECURITY DEFINER gardent auth.uid() de leur appelant, donc ce qu'elles écrivent est jugé aussi. Une contrainte check (même NOT VALID) serait vérifiée à chaque UPDATE de la ligne, cascades comprises : une ancienne opération de 12,50 € aurait bloqué la suppression du compte de son auteur. Le trigger ne juge donc qu'une valeur écrite : à l'insertion elle doit être entière ; à la mise à jour, la nouvelle valeur ou l'écart doit l'être — un versement entier sur un ancien objectif à 12,50 reste accepté.
create function public.guard_whole_amounts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_col text;
  v_new numeric;
  v_old numeric;
begin
  -- Écritures d'un utilisateur seulement, comme force_server_timestamps() : une reprise de données faite en tant que postgres garde ses montants.
  if auth.uid() is null then
    return new;
  end if;
  foreach v_col in array tg_argv loop
    v_new := (to_jsonb(new) ->> v_col)::numeric;
    if tg_op = 'INSERT' then
      if v_new <> round(v_new) then
        raise exception 'Indiquez un montant entier.';
      end if;
    else
      v_old := (to_jsonb(old) ->> v_col)::numeric;
      if v_new is distinct from v_old and v_new <> round(v_new) and (v_new - v_old) <> round(v_new - v_old) then
        raise exception 'Indiquez un montant entier.';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.guard_whole_amounts() from public, anon, authenticated;

create trigger transactions_guard_whole_amounts before insert or update of amount on public.transactions
  for each row execute function public.guard_whole_amounts('amount');
create trigger budgets_guard_whole_amounts before insert or update of amount on public.budgets
  for each row execute function public.guard_whole_amounts('amount');
create trigger savings_goals_guard_whole_amounts before insert or update of target_amount, current_amount on public.savings_goals
  for each row execute function public.guard_whole_amounts('target_amount', 'current_amount');

-- ---------------------------------------------------------------------------
-- 7. Longueurs de texte : des triggers à la place des contraintes NOT VALID
-- ---------------------------------------------------------------------------

-- Les contraintes NOT VALID de 20260929000100 restent vérifiées à chaque UPDATE de la ligne. Une note de plus de 120 caractères saisie avant leur création faisait échouer la mise à NULL de user_id quand son auteur supprimait son compte : delete_own_account() refusait, prouvé sur la pile locale. Un nom d'objectif trop long bloquait de même chaque versement (mise à jour de current_amount). Le trigger ne juge la longueur que d'une valeur écrite ou modifiée, et garde la donnée héritée telle quelle.
create function public.guard_text_length()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_col text := tg_argv[0];
  v_max integer := tg_argv[1]::integer;
  v_new text := to_jsonb(new) ->> v_col;
begin
  if v_new is not null
     and char_length(v_new) > v_max
     and (tg_op = 'INSERT' or v_new is distinct from (to_jsonb(old) ->> v_col)) then
    raise exception '%', tg_argv[2];
  end if;
  return new;
end;
$$;
revoke all on function public.guard_text_length() from public, anon, authenticated;

alter table public.transactions drop constraint transactions_note_length;
create trigger transactions_guard_note_length before insert or update of note on public.transactions
  for each row execute function public.guard_text_length('note', '120', 'La note ne peut pas dépasser 120 caractères.');

alter table public.savings_goals drop constraint savings_goals_name_length;
create trigger savings_goals_guard_name_length before insert or update of name on public.savings_goals
  for each row execute function public.guard_text_length('name', '60', 'Le nom ne peut pas dépasser 60 caractères.');

alter table public.budget_groups drop constraint budget_groups_name_length;
create trigger budget_groups_guard_name_length before insert or update of name on public.budget_groups
  for each row execute function public.guard_text_length('name', '60', 'Le nom ne peut pas dépasser 60 caractères.');

alter table public.users drop constraint users_display_name_length;
create trigger users_guard_display_name_length before insert or update of display_name on public.users
  for each row execute function public.guard_text_length('display_name', '64', 'Le nom ne peut pas dépasser 64 caractères.');

-- ---------------------------------------------------------------------------
-- 8. Supprimer un compte ne doit jamais emporter un groupe peuplé
-- ---------------------------------------------------------------------------

-- delete_own_account() refusait déjà, mais une suppression depuis le tableau de bord — la voie de secours proposée par la page de suppression — passait outre : la cascade sur budget_groups.owner_id effaçait le groupe, ses opérations et les adhésions de tous ses membres (prouvé). Le contrôle vit désormais sur la ligne users elle-même, donc sur tous les chemins ; il ferme aussi la course entre le contrôle de delete_own_account() et la suppression. Avant de supprimer un tel compte, passer la main (transfer_ownership) ou exclure les autres membres.
create function public.guard_owner_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blocking text;
begin
  select string_agg(format('« %s »', g.name), ', ' order by g.name)
    into v_blocking
    from public.budget_groups g
   where g.owner_id = old.id
     and not g.is_personal
     and exists (
       select 1 from public.account_memberships m
        where m.group_id = g.id and m.user_id <> old.id
     );

  if v_blocking is not null then
    raise exception 'Groupes partagés dont vous êtes propriétaire et qui ont encore d''autres membres : %. Excluez ces membres avant de supprimer votre compte.', v_blocking;
  end if;
  return old;
end;
$$;
revoke all on function public.guard_owner_deletion() from public, anon, authenticated;

create trigger users_guard_owner_deletion before delete on public.users
  for each row execute function public.guard_owner_deletion();

-- ---------------------------------------------------------------------------
-- 9. transfer_ownership() : l'appelant est-il encore propriétaire une fois le verrou pris ?
-- ---------------------------------------------------------------------------

-- Deux passations simultanées vérifiaient toutes deux is_group_owner() avant le verrou : la seconde passait la main alors que l'appelant ne l'avait plus, et le groupe finissait avec deux propriétaires (prouvé avec deux sessions). Le contrôle est refait après le verrou.
create or replace function public.transfer_ownership(p_group_id uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;
  if not public.is_group_owner(p_group_id) then
    raise exception 'Seul le propriétaire du groupe peut passer la main.';
  end if;
  if p_new_owner = v_uid then
    raise exception 'Vous êtes déjà propriétaire de ce groupe.';
  end if;

  -- Le verrou sur les deux adhésions sérialise un départ ou une exclusion simultanés, et une autre passation.
  perform 1 from public.account_memberships
    where group_id = p_group_id and user_id in (v_uid, p_new_owner)
    for update;

  if not exists (
    select 1 from public.account_memberships
     where group_id = p_group_id and user_id = v_uid and role = 'owner'
  ) then
    raise exception 'Seul le propriétaire du groupe peut passer la main.';
  end if;

  update public.account_memberships
     set role = 'owner'
   where group_id = p_group_id
     and user_id = p_new_owner;

  if not found then
    raise exception 'Cette personne n''est plus membre du groupe.';
  end if;

  update public.account_memberships
     set role = 'member'
   where group_id = p_group_id
     and user_id = v_uid;

  update public.budget_groups
     set owner_id = p_new_owner
   where id = p_group_id
     and not is_personal;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Ajuster au solde réel, avec un ancien montant décimal dans le portefeuille
-- ---------------------------------------------------------------------------

-- opening_balance doit rester entier : avec une ancienne opération de 12,50, l'écart valait x,50 et l'ajustement échouait pour toujours sur wallets_opening_balance_check (prouvé). L'écart est arrondi au franc, de façon que le solde affiché (lui-même arrondi) montre le montant demandé.
create or replace function public.adjust_wallet_balance(p_wallet_id uuid, p_actual numeric)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  wallet public.wallets;
  current_balance numeric;
  v_gap numeric;
begin
  if p_actual is null or p_actual <> round(p_actual) then
    raise exception 'Indiquez un montant entier.';
  end if;

  select * into wallet from public.wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'Ce portefeuille n''existe plus.';
  end if;

  select o.balance into current_balance
    from public.wallets_overview(wallet.group_id) o
   where o.id = wallet.id;

  -- Avec un reste de 0,50, le nouveau solde tombe à mi-chemin et s'afficherait au franc supérieur : l'écart est alors corrigé d'un franc, pour que l'écran montre exactement le montant saisi.
  v_gap := round(p_actual - current_balance);
  if round(current_balance + v_gap) <> p_actual then
    v_gap := v_gap + (p_actual - round(current_balance + v_gap));
  end if;

  update public.wallets
     set opening_balance = opening_balance + v_gap
   where id = wallet.id;

  return v_gap;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Rythme d'épargne au franc
-- ---------------------------------------------------------------------------

-- Arrondi au centime, 100 000 sur 3 mois donnait 33 333,34, affiché 33 333 : épargner le rythme affiché laissait la cible à 1 franc. Le rythme est arrondi au franc supérieur.
create or replace function public.savings_plans(p_today date)
returns table (goal_id uuid, monthly_rhythm numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    g.id,
    ceil(
      (g.target_amount - g.current_amount)
      / greatest(
          (extract(year from g.target_date) * 12 + extract(month from g.target_date))
          - (extract(year from p_today) * 12 + extract(month from p_today)),
          1
        )
    )
  from public.savings_goals g
  where g.target_date is not null
    and g.current_amount < g.target_amount;
$$;

-- ---------------------------------------------------------------------------
-- 12. Le montant épargné ne s'écrit que par add_to_savings_goal()
-- ---------------------------------------------------------------------------

-- Un PATCH sur current_amount suivi d'un retrait faisait entrer au solde de l'argent qui n'avait jamais été versé (prouvé : 400 000 FCFA de revenu inventé). L'app ne modifie que ces quatre colonnes ; le montant initial reste fixé à la création.
revoke update on public.savings_goals from authenticated;
grant update (name, icon, target_amount, target_date) on public.savings_goals to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Une opération supprimée ne ressuscite pas
-- ---------------------------------------------------------------------------

-- Une création arrivée en base sans que sa réponse revienne est rejouée plus tard ; si un membre a supprimé la ligne entre-temps, « on conflict (id) do nothing » ne trouvait plus de conflit et la réinsérait (prouvé). Toute suppression d'opération est journalisée, compte personnel compris, et gardée 24 mois : le journal sert de pierre tombale. La saisie refusée arrive dans « À corriger », d'où l'utilisateur peut la recréer s'il le veut vraiment.
create index activity_log_deleted_transaction_idx on public.activity_log (subject_id)
  where subject = 'transaction' and action = 'delete';

create function public.guard_transaction_resurrection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.activity_log
     where subject = 'transaction' and action = 'delete' and subject_id = new.id
  ) then
    raise exception 'Cette opération a été supprimée entre-temps.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_transaction_resurrection() from public, anon, authenticated;

create trigger transactions_guard_resurrection before insert on public.transactions
  for each row execute function public.guard_transaction_resurrection();

-- ---------------------------------------------------------------------------
-- 14. Requêtes qui relisaient tout l'historique
-- ---------------------------------------------------------------------------

-- filtered_transactions() lisait tout l'historique du groupe même pour un jour (10 ms contre 1 ms pour period_summary sur 30 000 opérations) : son corps SQL était planifié sans connaître p_from, et « p_from is null or occurred_on >= p_from » ne bornait pas l'index. Les bornes écrites avec coalesce ne suffisent pas (mesuré : pire, 300 ms), et une fonction plpgsql ordinaire passe au plan générique après cinq appels dans une même connexion. EXECUTE … USING planifie chaque appel avec les valeurs réelles : les filtres absents disparaissent du plan, et les bornes deviennent des conditions d'index (1,4 ms). Les valeurs passent en paramètres, jamais dans le texte de la requête.
create or replace function public.filtered_transactions(
  p_group_id uuid,
  p_from date default null,
  p_to date default null,
  p_type public.transaction_type default null,
  p_category_id uuid default null,
  p_search text default null,
  p_category_ids uuid[] default null,
  p_wallet_id uuid default null,
  p_tag text default null
)
returns setof public.transactions
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  return query execute $q$
    select t.*
    from public.transactions t
    where t.group_id = $1
      and ($2::date is null or t.occurred_on >= $2)
      and ($3::date is null or t.occurred_on < $3)
      and ($4::public.transaction_type is null or t.type = $4)
      and ($5::uuid is null or t.category_id = $5)
      and ($7::uuid[] is null or t.category_id = any ($7))
      and ($8::uuid is null or t.wallet_id = $8)
      and ($9::text is null or t.tags @> array[$9])
      and ($6::text is null or strpos(lower(coalesce(t.note, '')), lower($6)) > 0)
  $q$
  using p_group_id, p_from, p_to, p_type, p_category_id, p_search, p_category_ids, p_wallet_id, p_tag;
end;
$$;

-- Les étiquettes : seules les opérations qui en portent, par un index partiel. Avant, chaque ouverture du formulaire dépliait tout l'historique (350 ms sur 30 000 opérations sans aucune étiquette).
create index transactions_tagged_idx on public.transactions (group_id) where tags <> '{}';

create or replace function public.transaction_tags(p_group_id uuid)
returns table (tag text, uses integer)
language sql
stable
security invoker
set search_path = public
as $$
  select t.tag, count(*)::integer
    from public.transactions x
   cross join lateral unnest(x.tags) as t(tag)
   where x.group_id = p_group_id
     and x.tags <> '{}'
   group by t.tag
   order by count(*) desc, max(x.occurred_on) desc, t.tag
   limit 30;
$$;

-- Les montants fréquents : la fenêtre de 90 jours porte sur occurred_on, que l'index (group_id, occurred_on) borne, et non plus sur created_at, qui faisait lire tout l'historique du groupe à chaque ouverture du formulaire.
create or replace function public.frequent_amounts(
  p_group_id uuid,
  p_type public.transaction_type,
  p_limit integer default 4
)
returns table (amount numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select t.amount
  from public.transactions t
  where t.group_id = p_group_id
    and t.occurred_on >= current_date - 90
    and t.user_id = auth.uid()
    and t.type = p_type
    and not t.is_savings
    and t.debt_id is null
  group by t.amount
  having count(*) >= 2
  order by count(*) desc, max(t.occurred_on) desc
  limit greatest(least(p_limit, 8), 0);
$$;

-- ---------------------------------------------------------------------------
-- 15. Policies de lecture évaluées une fois par requête, pas une fois par ligne
-- ---------------------------------------------------------------------------

-- is_group_member(group_id) est SECURITY DEFINER avec un SET : Postgres ne peut ni la déplier ni la sortir de la boucle, et la rappelait pour chaque ligne lue — environ 13 µs. Sur deux ans d'un commerce de 30 000 opérations, period_summary() prenait 450 ms et wallets_overview() 300 ms. La liste des groupes de l'appelant est calculée une fois par requête (sous-plan haché) : 29 ms et 16 ms, mesurés. Seules les policies de lecture des tables qui grossissent changent ; les écritures gardent is_group_member(). my_group_ids() est SECURITY DEFINER pour la même raison que les autres helpers : lire account_memberships depuis une policy sans récursion.
create function public.my_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select group_id from public.account_memberships where user_id = auth.uid();
$$;
revoke all on function public.my_group_ids() from public, anon;
grant execute on function public.my_group_ids() to authenticated;

drop policy "transactions_select_member" on public.transactions;
create policy "transactions_select_member" on public.transactions for select to authenticated
  using (group_id in (select public.my_group_ids()));

drop policy "budgets_select_member" on public.budgets;
create policy "budgets_select_member" on public.budgets for select to authenticated
  using (group_id in (select public.my_group_ids()));

drop policy "debts_select_member" on public.debts;
create policy "debts_select_member" on public.debts for select to authenticated
  using (group_id in (select public.my_group_ids()));

drop policy "wallets_select_member" on public.wallets;
create policy "wallets_select_member" on public.wallets for select to authenticated
  using (group_id in (select public.my_group_ids()));

drop policy "wallet_transfers_select_member" on public.wallet_transfers;
create policy "wallet_transfers_select_member" on public.wallet_transfers for select to authenticated
  using (group_id in (select public.my_group_ids()));

drop policy "recurring_transactions_select_member" on public.recurring_transactions;
create policy "recurring_transactions_select_member" on public.recurring_transactions for select to authenticated
  using (group_id in (select public.my_group_ids()));

drop policy "activity_log_select_member" on public.activity_log;
create policy "activity_log_select_member" on public.activity_log for select to authenticated
  using (group_id in (select public.my_group_ids()));

drop policy "categories_select_default_or_member" on public.categories;
create policy "categories_select_default_or_member" on public.categories for select to authenticated
  using (group_id is null or group_id in (select public.my_group_ids()));
