-- Wazu Finance — opérations récurrentes, et budgets hebdomadaires dans la synthèse
--
-- Deux demandes de l'audit du 2026-09-25 : le loyer, la tontine, la scolarité ou l'électricité reviennent à date fixe et se ressaisissaient à la main chaque fois ; et pour qui est payé à la journée ou à la semaine, un budget mensuel n'a pas d'horizon utile.

-- ---------------------------------------------------------------------------
-- 1. budget_totals() — la synthèse ne totalise que les budgets mensuels
-- ---------------------------------------------------------------------------

-- La colonne budgets.period accepte 'weekly' depuis le schéma initial ; l'app l'expose désormais. Un plafond hebdomadaire ne s'additionne pas à un plafond mensuel : leur somme ne décrirait aucune période. La carte de synthèse porte donc sur les budgets mensuels seuls, sur les bornes de la période ; chaque budget hebdomadaire garde sa propre carte, comparée à la semaine en cours par l'app (weekBounds()).
--
-- Corps inchangé par ailleurs (20260919000400_envelopes.sql).
create or replace function public.budget_totals(p_group_id uuid, p_from date, p_to date)
returns table (spent numeric, ceiling numeric, remaining numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with monthly as (
    select b.category_id, b.amount
    from public.budgets b
    where b.group_id = p_group_id
      and b.period = 'monthly'
  ),
  ceilings as (
    select coalesce(sum(m.amount), 0) as ceiling from monthly m
  ),
  spending as (
    select coalesce(sum(t.amount), 0) as spent
    from public.transactions t
    where t.group_id = p_group_id
      and t.type = 'expense'
      and t.occurred_on >= p_from
      and t.occurred_on < p_to
      and t.category_id in (select m.category_id from monthly m)
  )
  select spending.spent, ceilings.ceiling, ceilings.ceiling - spending.spent
  from ceilings, spending;
$$;

-- ---------------------------------------------------------------------------
-- 2. recurring_transactions — les modèles d'opérations qui reviennent
-- ---------------------------------------------------------------------------

create type public.recurrence_frequency as enum ('weekly', 'monthly');

-- Un modèle, pas une opération : rien n'entre au solde tant qu'un membre ne l'a pas confirmé. Une tontine reportée ou un loyer payé en retard ne doit pas compter comme payé le jour prévu. À l'échéance, l'app le propose en tête de la Synthèse ; confirm_recurring() crée l'opération, skip_recurring() passe cette fois.
--
-- anchor_day : le jour du mois (1 à 28, comme period_start_day, parce que les 29, 30 et 31 n'existent pas tous les mois) pour une récurrence mensuelle ; le jour de la semaine ISO (1 = lundi, 7 = dimanche) pour une hebdomadaire. next_due_on est la prochaine échéance, toujours sur ce jour — la contrainte le vérifie, pour qu'une date calculée de travers côté client ne décale pas toute la suite.
--
-- Rattaché à un groupe, comme les opérations : le loyer d'un budget partagé est proposé à tous ses membres, et le premier qui le confirme l'enregistre.
create table public.recurring_transactions (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.budget_groups (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  category_id  uuid references public.categories (id) on delete set null,
  type         public.transaction_type not null,
  amount       numeric(12, 2) not null check (amount > 0 and amount = round(amount)),
  note         text check (note is null or char_length(note) <= 120),
  frequency    public.recurrence_frequency not null,
  anchor_day   smallint not null,
  next_due_on  date not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint recurring_anchor_matches check (
    (frequency = 'monthly' and anchor_day between 1 and 28 and extract(day from next_due_on) = anchor_day)
    or (frequency = 'weekly' and anchor_day between 1 and 7 and extract(isodow from next_due_on) = anchor_day)
  )
);

create index recurring_transactions_group_due_idx
  on public.recurring_transactions (group_id, next_due_on);

create trigger recurring_transactions_touch_updated_at
  before update on public.recurring_transactions
  for each row execute function public.touch_updated_at();

alter table public.recurring_transactions enable row level security;

create policy "recurring_transactions_select_member"
  on public.recurring_transactions for select to authenticated
  using (public.is_group_member(group_id));

create policy "recurring_transactions_insert_member"
  on public.recurring_transactions for insert to authenticated
  with check (public.is_group_member(group_id) and user_id = (select auth.uid()));

create policy "recurring_transactions_update_member"
  on public.recurring_transactions for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

create policy "recurring_transactions_delete_member"
  on public.recurring_transactions for delete to authenticated
  using (public.is_group_member(group_id));

-- Les privilèges par défaut de Supabase donnent la table entière à anon et authenticated : on les reprend, puis on n'accorde que ce que l'app écrit. Le rythme (frequency, anchor_day) ne se modifie pas : le changer se fait en supprimant le modèle et en en créant un autre, ce qui évite une échéance incohérente avec son nouveau rythme. next_due_on reste modifiable, parce que confirm_recurring() et skip_recurring() l'avancent avec les droits de l'appelant.
revoke all on public.recurring_transactions from anon, authenticated;
grant select, delete on public.recurring_transactions to authenticated;
grant insert (id, group_id, user_id, category_id, type, amount, note, frequency, anchor_day, next_due_on)
  on public.recurring_transactions to authenticated;
grant update (category_id, type, amount, note, next_due_on)
  on public.recurring_transactions to authenticated;

-- Dans la publication Realtime, comme transactions : le loyer confirmé par un membre disparaît aussitôt de la liste « À confirmer » des autres.
alter publication supabase_realtime add table public.recurring_transactions;

-- ---------------------------------------------------------------------------
-- 3. Échéance suivante
-- ---------------------------------------------------------------------------

-- L'échéance qui suit p_due_on. Mensuelle : le même jour, le mois suivant ; anchor_day ≤ 28 garantit que ce jour existe. Hebdomadaire : sept jours plus tard.
create function public.next_recurrence(
  p_frequency public.recurrence_frequency,
  p_anchor_day smallint,
  p_due_on date
)
returns date
language sql
immutable
set search_path = public
as $$
  select case p_frequency
    when 'weekly' then p_due_on + 7
    else make_date(
      extract(year from (date_trunc('month', p_due_on) + interval '1 month'))::int,
      extract(month from (date_trunc('month', p_due_on) + interval '1 month'))::int,
      p_anchor_day
    )
  end;
$$;

revoke all on function public.next_recurrence(public.recurrence_frequency, smallint, date) from public, anon;
grant execute on function public.next_recurrence(public.recurrence_frequency, smallint, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Confirmer ou passer une échéance
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER : l'opération est insérée et le modèle avancé avec les droits de l'appelant, donc transactions_insert_member (membre du groupe, user_id = auth.uid()) et recurring_transactions_update_member s'appliquent telles quelles. Aucun contournement à auditer.
--
-- p_due_on est l'échéance que l'appelant a vue : si le modèle a déjà avancé, un autre membre l'a confirmée ou passée entre-temps, et la seconde confirmation est refusée au lieu de créer un doublon. Le `for update` sérialise deux confirmations simultanées.
--
-- p_transaction_id est tiré par l'app, comme pour une saisie ordinaire (src/data/transactions.ts) : si la réponse s'est perdue et que l'app renvoie la même confirmation, l'opération existe déjà et elle est renvoyée telle quelle, sans erreur ni doublon.
--
-- p_amount permet d'ajuster le montant de cette fois-ci (une facture d'électricité varie) sans toucher au modèle ; NULL reprend le montant du modèle. p_occurred_on vient de l'appareil ; NULL date l'opération de l'échéance.
create function public.confirm_recurring(
  p_id uuid,
  p_due_on date,
  p_transaction_id uuid,
  p_amount numeric default null,
  p_occurred_on date default null
)
returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  recurring public.recurring_transactions;
  created public.transactions;
begin
  select * into created from public.transactions where id = p_transaction_id;
  if found then
    return created;
  end if;

  if p_amount is not null and (p_amount <= 0 or p_amount <> round(p_amount)) then
    raise exception 'Indiquez un montant entier, supérieur à zéro.';
  end if;

  select * into recurring
    from public.recurring_transactions
   where id = p_id
     for update;
  if not found then
    raise exception 'Cette opération récurrente n''existe plus.';
  end if;

  if recurring.next_due_on <> p_due_on then
    raise exception 'Cette échéance a déjà été traitée par un autre membre.';
  end if;

  insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on, note)
  values (
    p_transaction_id,
    recurring.group_id,
    auth.uid(),
    recurring.category_id,
    recurring.type,
    coalesce(p_amount, recurring.amount),
    coalesce(p_occurred_on, p_due_on),
    recurring.note
  )
  returning * into created;

  update public.recurring_transactions
     set next_due_on = public.next_recurrence(frequency, anchor_day, p_due_on)
   where id = p_id;

  return created;
end;
$$;

revoke all on function public.confirm_recurring(uuid, date, uuid, numeric, date) from public, anon;
grant execute on function public.confirm_recurring(uuid, date, uuid, numeric, date) to authenticated;

-- Passer une échéance sans rien enregistrer : la tontine de ce mois n'a pas eu lieu, le loyer a été payé autrement. Même contrôle d'échéance que confirm_recurring(). Rejouer un « passer » déjà appliqué est sans effet : l'échéance a changé, et la fonction ne fait rien plutôt que de lever — il n'y a rien à perdre à ignorer un doublon de « ne rien faire ».
create function public.skip_recurring(p_id uuid, p_due_on date)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.recurring_transactions
     set next_due_on = public.next_recurrence(frequency, anchor_day, p_due_on)
   where id = p_id
     and next_due_on = p_due_on;
end;
$$;

revoke all on function public.skip_recurring(uuid, date) from public, anon;
grant execute on function public.skip_recurring(uuid, date) to authenticated;
