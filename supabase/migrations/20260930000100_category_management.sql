-- Gestion des catégories personnalisées : combien d'opérations, de budgets et de modèles récurrents chacune porte, et sa suppression avec report des opérations sur une autre catégorie.
--
-- Jusqu'ici l'app créait des catégories sans pouvoir les supprimer ; la policy categories_delete_member existait depuis le schéma initial. Supprimée sans report, une catégorie laisse ses opérations sans catégorie (on delete set null) : elles comptent toujours dans les dépenses mais sortent de la répartition, ce qui se lit comme de l'argent disparu.

-- ---------------------------------------------------------------------------
-- 1. Usage de chaque catégorie du groupe
-- ---------------------------------------------------------------------------

-- Les catégories propres au groupe seulement : celles par défaut ne se gèrent pas. SECURITY INVOKER : un non-membre ne voit aucune catégorie du groupe et reçoit zéro ligne.
create function public.category_usage(p_group_id uuid)
returns table (category_id uuid, transactions bigint, budgets bigint, recurring bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    (select count(*) from public.transactions t where t.category_id = c.id),
    (select count(*) from public.budgets b where b.category_id = c.id),
    (select count(*) from public.recurring_transactions r where r.category_id = c.id)
  from public.categories c
  where c.group_id = p_group_id;
$$;

revoke all on function public.category_usage(uuid) from public, anon;
grant execute on function public.category_usage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Report des opérations, dans un trigger
-- ---------------------------------------------------------------------------

-- Le report se fait dans un trigger BEFORE DELETE plutôt que dans delete_category() elle-même : les gardes de transactions (guard_debt_movement pour un encaissement de vente à crédit, qui porte la catégorie « Commerce ») refusent toute modification faite au niveau 1 des triggers, et ce report n'est pas une modification faite depuis l'historique. Lancé depuis ce trigger, il passe au niveau 2, comme les autres cascades. guard_viewer_write refuse déjà un lecteur sur la suppression de la catégorie, au niveau 1, et son nom le fait passer avant ce trigger (ordre alphabétique).
--
-- La catégorie de remplacement arrive par un réglage local à la transaction, posé par delete_category() sous la forme « <catégorie supprimée>:<remplaçante> » : un DELETE ne transporte pas d'argument. Sans ce réglage, ou posé pour une autre catégorie, rien n'est reporté et la suppression se comporte comme avant. La remplaçante est revérifiée ici : même type, et catégorie par défaut ou du même groupe.
--
-- SECURITY INVOKER : les mises à jour passent par transactions_update_member et recurring_transactions_update_member, et category_id est une colonne que les clients ont déjà le droit d'écrire sur les deux tables. Les opérations reportées sont marquées « modifiée » et entrent au journal d'activité : leur catégorie a réellement changé, et un autre membre doit pouvoir le lire.
--
-- Les budgets de la catégorie ne sont pas reportés : budgets.category_id est figé (guard_immutable_columns), et la remplaçante peut déjà avoir le sien. Ils partent avec elle (on delete cascade), ce que l'app annonce avant de confirmer.
create function public.reassign_category_rows()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_setting text := coalesce(current_setting('wazu.category_replacement', true), '');
  v_target uuid;
begin
  if split_part(v_setting, ':', 1) <> old.id::text then
    return old;
  end if;

  v_target := split_part(v_setting, ':', 2)::uuid;

  if not exists (
    select 1
    from public.categories r
    where r.id = v_target
      and r.id <> old.id
      and r.type = old.type
      and (r.group_id is null or r.group_id = old.group_id)
  ) then
    raise exception 'Choisissez une autre catégorie du même type, dans ce budget.';
  end if;

  update public.transactions set category_id = v_target where category_id = old.id;
  update public.recurring_transactions set category_id = v_target where category_id = old.id;

  return old;
end;
$$;

create trigger categories_reassign_rows
  before delete on public.categories
  for each row execute function public.reassign_category_rows();

-- ---------------------------------------------------------------------------
-- 3. Suppression
-- ---------------------------------------------------------------------------

-- p_replacement_id NULL : les opérations restent sans catégorie, comme une suppression directe. L'app en exige une dès que la catégorie porte des opérations ou des modèles récurrents.
--
-- Une catégorie déjà supprimée (un second appui après une réponse perdue, un autre membre plus rapide) n'est pas une erreur : il n'y a plus rien à faire. SECURITY INVOKER : categories_delete_member et guard_viewer_write décident qui supprime.
create function public.delete_category(p_id uuid, p_replacement_id uuid default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_category public.categories;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  select * into v_category from public.categories where id = p_id;
  if not found then
    return;
  end if;

  if v_category.group_id is null then
    raise exception 'Les catégories par défaut ne se suppriment pas.';
  end if;

  if p_replacement_id is not null then
    perform set_config('wazu.category_replacement', p_id::text || ':' || p_replacement_id::text, true);
  end if;

  delete from public.categories where id = p_id;

  perform set_config('wazu.category_replacement', '', true);
end;
$$;

revoke all on function public.delete_category(uuid, uuid) from public, anon;
grant execute on function public.delete_category(uuid, uuid) to authenticated;
