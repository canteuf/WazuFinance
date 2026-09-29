-- Durcissement issu de l'évaluation du 29 septembre 2026 (lot 1) : un lecteur ne peut plus se donner le droit d'écrire, un membre exclu ne revient plus avec l'ancien code, le chemin de rejeu des fonctions SECURITY DEFINER ne renvoie plus une ligne d'un groupe dont l'appelant n'est pas membre, et les textes libres ont une longueur maximale.

-- ---------------------------------------------------------------------------
-- 1. Les lecteurs ne lisent plus les codes d'invitation
-- ---------------------------------------------------------------------------

-- Un lecteur pouvait lire un code « membre », quitter le groupe (account_memberships_delete_owner_or_self), puis le rejoindre avec ce code : join_group_with_code() lui donnait le rôle du code, donc le droit d'écrire. Les membres gardent la lecture : ils partagent le code avec leurs proches, et un code « membre » ne leur apporte rien qu'ils n'aient déjà.
drop policy "group_invitations_select_member" on public.group_invitations;

create policy "group_invitations_select_writer"
  on public.group_invitations for select to authenticated
  using (public.is_group_member(group_id) and not public.is_group_viewer(group_id));

-- ---------------------------------------------------------------------------
-- 2. Exclure ou rétrograder révoque les codes que la personne a vus
-- ---------------------------------------------------------------------------

-- Exclusion (un membre supprimé par quelqu'un d'autre que lui-même, donc par le propriétaire) : tous les codes actifs du groupe, sinon la personne exclue revenait avec le code encore valable 7 jours. Rétrogradation de membre à lecteur : les codes « membre » actifs, qu'elle a lus. Un départ volontaire ne révoque rien : la personne peut revenir, avec le rôle du code qu'on lui donnera.
--
-- pg_trigger_depth() = 1 : seulement l'action directe d'un client (ou de set_member_role(), dont l'update est au même niveau). La suppression d'un groupe ou d'un compte arrive en cascade, plus profond, et n'a rien à révoquer.
--
-- SECURITY INVOKER : l'exclusion est faite par le propriétaire, que group_invitations_update_owner autorise, et la rétrogradation passe par set_member_role(), déjà SECURITY DEFINER.
create function public.revoke_invitations_on_member_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() <> 1 then
    return null;
  end if;

  if tg_op = 'DELETE' then
    if old.user_id is distinct from auth.uid() then
      update public.group_invitations
         set revoked_at = now()
       where group_id = old.group_id
         and revoked_at is null
         and expires_at > now();
    end if;
  elsif old.role = 'member' and new.role = 'viewer' then
    update public.group_invitations
       set revoked_at = now()
     where group_id = new.group_id
       and role = 'member'
       and revoked_at is null
       and expires_at > now();
  end if;

  return null;
end;
$$;

create trigger account_memberships_revoke_invitations
  after delete or update of role on public.account_memberships
  for each row execute function public.revoke_invitations_on_member_change();

-- ---------------------------------------------------------------------------
-- 3. Rejeu : jamais une ligne d'un groupe dont l'appelant n'est pas membre
-- ---------------------------------------------------------------------------

-- Ces fonctions renvoyaient la ligne trouvée par son id avant de vérifier l'appartenance au groupe : un ancien membre qui avait gardé des ids relisait la dette ou le transfert à jour (contrepartie, note, échéance). Corps inchangés par ailleurs (20260928000200_real_usage.sql, 20260926000100_wallets.sql) ; même signature, donc un simple remplacement qui garde les droits.

create or replace function public.create_debt(
  p_id uuid,
  p_group_id uuid,
  p_direction public.debt_direction,
  p_counterparty text,
  p_amount numeric,
  p_occurred_on date,
  p_transaction_id uuid,
  p_due_on date default null,
  p_note text default null,
  -- Portefeuille d'où sort le prêt, ou où entre l'emprunt. NULL : celui par défaut du groupe. Ignoré pour une vente à crédit, qui ne déplace rien.
  p_wallet_id uuid default null
)
returns public.debts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  created public.debts;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  select * into created from public.debts where id = p_id;
  if found then
    if not public.is_group_member(created.group_id) then
      raise exception 'Vous n''avez pas accès à ce budget.';
    end if;
    return created;
  end if;

  if not public.is_group_member(p_group_id) then
    raise exception 'Vous n''avez pas accès à ce budget.';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount) then
    raise exception 'Indiquez un montant entier, supérieur à zéro.';
  end if;

  insert into public.debts (id, group_id, user_id, direction, counterparty, amount, due_on, note)
  values (p_id, p_group_id, v_uid, p_direction, btrim(p_counterparty), p_amount, p_due_on, nullif(btrim(coalesce(p_note, '')), ''))
  returning * into created;

  -- Une vente à crédit ne fait rien entrer le jour de la vente : l'argent arrive avec chaque versement.
  if p_direction = 'credit_sale' then
    return created;
  end if;

  -- Prêter fait sortir l'argent, emprunter le fait entrer. assign_transaction_wallet() refuse un portefeuille d'un autre groupe.
  insert into public.transactions (id, group_id, user_id, type, amount, occurred_on, note, debt_id, wallet_id)
  values (
    p_transaction_id,
    p_group_id,
    v_uid,
    case p_direction when 'lent' then 'expense' else 'income' end::public.transaction_type,
    p_amount,
    coalesce(p_occurred_on, current_date),
    case p_direction when 'lent' then 'Prêt à ' else 'Emprunt à ' end || created.counterparty,
    created.id,
    p_wallet_id
  );

  return created;
end;
$$;

-- Le rejeu est aussi cherché après le verrou sur la dette : deux envois simultanés du même versement (réponse perdue, puis renvoi) faisaient échouer le second — doublon de clé, ou « dépasse ce qui reste dû » — alors que le premier était passé. Le second attend désormais le premier, puis trouve sa ligne.
create or replace function public.record_debt_payment(
  p_debt_id uuid,
  p_amount numeric,
  p_occurred_on date,
  p_transaction_id uuid,
  p_wallet_id uuid default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  debt public.debts;
  paid numeric;
  payment_type public.transaction_type;
  created public.transactions;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  select * into debt from public.debts where id = p_debt_id for update;
  if not found or not public.is_group_member(debt.group_id) then
    raise exception 'Cette dette n''existe plus.';
  end if;

  select * into created from public.transactions where id = p_transaction_id and debt_id = p_debt_id;
  if found then
    return created;
  end if;

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount) then
    raise exception 'Indiquez un montant entier, supérieur à zéro.';
  end if;

  -- Être remboursé (prêt, vente à crédit) fait entrer l'argent ; rembourser un emprunt le fait sortir.
  payment_type := case debt.direction when 'borrowed' then 'expense' else 'income' end;

  select coalesce(sum(t.amount), 0) into paid
    from public.transactions t
   where t.debt_id = debt.id
     and t.type = payment_type;

  if p_amount > debt.amount - paid then
    raise exception 'Le remboursement dépasse ce qui reste dû.';
  end if;

  insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on, note, debt_id, wallet_id)
  values (
    p_transaction_id,
    debt.group_id,
    v_uid,
    case when debt.direction = 'credit_sale' then public.commerce_category(debt.group_id) end,
    payment_type,
    p_amount,
    coalesce(p_occurred_on, current_date),
    case debt.direction
      when 'lent' then 'Remboursement de '
      when 'borrowed' then 'Remboursement à '
      else 'Vente à crédit : versement de '
    end || debt.counterparty,
    debt.id,
    p_wallet_id
  )
  returning * into created;

  return created;
end;
$$;

create or replace function public.transfer_between_wallets(
  p_id uuid,
  p_from_wallet_id uuid,
  p_to_wallet_id uuid,
  p_amount numeric,
  p_occurred_on date,
  p_fee_transaction_id uuid,
  p_fee numeric default 0,
  p_note text default null
)
returns public.wallet_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  created public.wallet_transfers;
  source public.wallets;
  target public.wallets;
  fee_category uuid;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  select * into created from public.wallet_transfers where id = p_id;
  if found then
    if not public.is_group_member(created.group_id) then
      raise exception 'Ce portefeuille n''existe plus.';
    end if;
    return created;
  end if;

  select * into source from public.wallets where id = p_from_wallet_id;
  select * into target from public.wallets where id = p_to_wallet_id;
  if source.id is null or target.id is null
     or source.group_id <> target.group_id
     or not public.is_group_member(source.group_id) then
    raise exception 'Ce portefeuille n''existe plus.';
  end if;

  if source.id = target.id then
    raise exception 'Choisissez deux portefeuilles différents.';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount) then
    raise exception 'Indiquez un montant entier, supérieur à zéro.';
  end if;
  if p_fee is null or p_fee < 0 or p_fee <> round(p_fee) then
    raise exception 'Les frais sont un montant entier, zéro ou plus.';
  end if;

  if p_fee > 0 then
    select id into fee_category
      from public.categories
     where group_id is null and type = 'expense' and name = 'Frais mobile money';

    insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on, note, wallet_id)
    values (
      p_fee_transaction_id,
      source.group_id,
      v_uid,
      fee_category,
      'expense',
      p_fee,
      coalesce(p_occurred_on, current_date),
      'Frais de transfert vers ' || target.name,
      source.id
    );
  end if;

  insert into public.wallet_transfers (id, group_id, user_id, from_wallet_id, to_wallet_id, amount, fee_transaction_id, occurred_on, note)
  values (
    p_id,
    source.group_id,
    v_uid,
    source.id,
    target.id,
    p_amount,
    case when p_fee > 0 then p_fee_transaction_id end,
    coalesce(p_occurred_on, current_date),
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning * into created;

  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Longueur maximale des textes libres
-- ---------------------------------------------------------------------------

-- Sans limite, un membre pouvait écrire une note de plusieurs mégaoctets, qui gonflait le cache hors ligne et les relevés PDF des autres membres. L'app limite la saisie plus court (src/lib/validation.ts) : ces bornes n'arrêtent que les appels directs à l'API.
--
-- NOT VALID : les lignes existantes ne sont pas contrôlées, seules les écritures à venir le sont. Une ligne plus longue enregistrée avant cette migration ne bloque donc pas son application.
--
-- 120 pour la note, comme celles des dettes, des transferts et des récurrences : une opération répétée passe sa note à sa récurrence, déjà limitée à 120. 60 pour le nom d'un objectif, qui devient la note d'un versement d'épargne. 64 pour le nom affiché : handle_new_user() retombe sur la partie locale de l'email, qui peut atteindre 64 caractères.
alter table public.transactions
  add constraint transactions_note_length check (note is null or char_length(note) <= 120) not valid;

alter table public.savings_goals
  add constraint savings_goals_name_length check (char_length(name) <= 60) not valid;

alter table public.users
  add constraint users_display_name_length check (char_length(display_name) <= 64) not valid;

alter table public.budget_groups
  add constraint budget_groups_name_length check (char_length(name) <= 60) not valid;
