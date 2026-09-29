-- Conformité avant publication (lot 2 de l'évaluation du 29 septembre 2026) : les durées de conservation annoncées par la politique de confidentialité deviennent des purges réelles, les suppressions de compte sont consignées pour être ré-appliquées après une restauration, deux mesures d'usage sont enregistrées, et chacun peut exporter toutes ses données.

-- ---------------------------------------------------------------------------
-- 1. Registre des comptes supprimés
-- ---------------------------------------------------------------------------

-- Une sauvegarde restaurée ferait revenir les comptes supprimés depuis sa date. Ce registre dit lesquels effacer de nouveau (procédure dans le README de canteuf/WazuFinance-ops). Il ne garde que l'identifiant, 35 jours : un peu plus que les 30 jours des sauvegardes, rien au-delà.
--
-- Un trigger sur public.users plutôt qu'une ligne dans delete_own_account() : il couvre aussi une suppression faite depuis le tableau de bord Supabase, qui passe par la même cascade depuis auth.users.
create table public.account_deletions (
  user_id    uuid primary key,
  deleted_at timestamptz not null default now()
);

alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from anon, authenticated;

-- SECURITY DEFINER : la suppression arrive en cascade depuis auth.users, exécutée par le rôle d'Auth (supabase_auth_admin) ou par postgres, qui n'ont pas à recevoir un droit d'écriture sur cette table.
create function public.record_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.account_deletions (user_id)
  values (old.id)
  on conflict (user_id) do update set deleted_at = now();
  return null;
end;
$$;

revoke all on function public.record_account_deletion() from public, anon, authenticated;

create trigger users_record_account_deletion
  after delete on public.users
  for each row execute function public.record_account_deletion();

-- ---------------------------------------------------------------------------
-- 2. Mesures d'usage
-- ---------------------------------------------------------------------------

-- Deux événements seulement : l'inscription, la première opération et l'adhésion à un groupe se lisent déjà dans users, transactions et account_memberships, par leur date de création. Aucun montant, aucune saisie : le type d'événement, le jour et l'identifiant du compte (pseudonyme). Une ligne par compte, par événement et par jour au plus.
--
-- Supprimées avec le compte (cascade), et après 13 mois par purge_expired_data().
create table public.product_events (
  user_id     uuid not null references public.users (id) on delete cascade,
  event       text not null check (event in ('app_opened', 'invite_shared')),
  occurred_on date not null default current_date,
  primary key (user_id, event, occurred_on)
);

create index product_events_occurred_idx on public.product_events (occurred_on);

alter table public.product_events enable row level security;
revoke all on public.product_events from anon, authenticated;

-- Seule écriture possible : un événement de la liste, pour l'appelant, daté par le serveur. Répété le même jour, il ne compte qu'une fois.
create function public.log_product_event(p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  insert into public.product_events (user_id, event)
  values (auth.uid(), p_event)
  on conflict do nothing;
end;
$$;

revoke all on function public.log_product_event(text) from public, anon;
grant execute on function public.log_product_event(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Purges
-- ---------------------------------------------------------------------------

-- Les durées que la politique de confidentialité annonce (docs/legal/confidentialite.html, section 7). Les purges paresseuses de join_group_with_code() et claim_request() restent : celle-ci rattrape les comptes qui ne reviennent jamais.
--
-- Le journal perd ses entrées de plus de 24 mois, ancien membre ou pas. Les invitations mortes (expirées ou révoquées) partent 30 jours après, le temps qu'un « code expiré » reste compréhensible dans l'app.
create function public.purge_expired_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.activity_log where occurred_at < now() - interval '24 months';
  delete from public.invitation_attempts where attempted_at < now() - interval '1 day';
  delete from public.applied_requests where created_at < now() - interval '30 days';
  delete from public.group_invitations
   where expires_at < now() - interval '30 days'
      or revoked_at < now() - interval '30 days';
  delete from public.product_events where occurred_on < current_date - interval '13 months';
  delete from public.account_deletions where deleted_at < now() - interval '35 days';
end;
$$;

revoke all on function public.purge_expired_data() from public, anon, authenticated;

-- Chaque nuit à 03:30 UTC, après la sauvegarde de 02:00 : une donnée purgée a eu sa dernière sauvegarde la veille. cron.schedule() remplace un job du même nom, donc rejouer cette migration ne le duplique pas.
create extension if not exists pg_cron;

select cron.schedule('purge-expired-data', '30 3 * * *', 'select public.purge_expired_data()');

-- ---------------------------------------------------------------------------
-- 4. Export de toutes ses données
-- ---------------------------------------------------------------------------

-- Le droit d'accès et la portabilité : tout ce que l'utilisateur a saisi, en un seul document JSON. Son compte personnel en entier (sa propre saisie), et, dans les budgets partagés, les lignes dont il est l'auteur ; ses objectifs d'épargne. Les saisies des autres membres ne sont pas ses données.
--
-- SECURITY INVOKER : les policies s'appliquent telles quelles, l'export ne peut rien renvoyer que l'appelant ne lise déjà. L'email vient du jeton : clients sans droit de lecture sur users.email.
create function public.export_my_data()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select auth.uid() as id
  ),
  personal as (
    select g.id
      from public.budget_groups g
      join public.account_memberships m on m.group_id = g.id
     where m.user_id = (select id from me) and g.is_personal
  )
  select jsonb_build_object(
    'format', 'wazu-finance-export-1',
    'exported_at', now(),
    'account', (
      select jsonb_build_object(
        'id', u.id,
        'email', auth.jwt() ->> 'email',
        'display_name', u.display_name,
        'avatar', u.avatar,
        'created_at', u.created_at
      )
        from public.users u
       where u.id = (select id from me)
    ),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'name', g.name, 'is_personal', g.is_personal,
               'role', m.role, 'joined_at', m.created_at, 'period_start_day', g.period_start_day
             ) order by m.created_at)
        from public.account_memberships m
        join public.budget_groups g on g.id = m.group_id
       where m.user_id = (select id from me)
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.occurred_on, t.created_at)
        from public.transactions t
       where t.group_id in (select id from personal) or t.user_id = (select id from me)
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.name)
        from public.categories c
       where c.group_id in (select id from personal)
    ), '[]'::jsonb),
    'budgets', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.created_at)
        from public.budgets b
       where b.group_id in (select id from personal)
    ), '[]'::jsonb),
    'wallets', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.created_at)
        from public.wallets w
       where w.group_id in (select id from personal)
    ), '[]'::jsonb),
    'wallet_transfers', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.occurred_on, x.created_at)
        from public.wallet_transfers x
       where x.group_id in (select id from personal) or x.user_id = (select id from me)
    ), '[]'::jsonb),
    'debts', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.created_at)
        from public.debts d
       where d.group_id in (select id from personal) or d.user_id = (select id from me)
    ), '[]'::jsonb),
    'recurring_transactions', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
        from public.recurring_transactions r
       where r.group_id in (select id from personal) or r.user_id = (select id from me)
    ), '[]'::jsonb),
    'savings_goals', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at)
        from public.savings_goals s
       where s.user_id = (select id from me)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
