-- Une opération, un budget ou un modèle récurrent ne peut porter qu'une catégorie par défaut ou une catégorie de son propre groupe.
--
-- Les clés étrangères vers categories ne regardent ni le groupe ni les policies : un membre de deux budgets pouvait ranger une opération du budget B dans une catégorie personnalisée du budget A. Deux conséquences :
--   - supprimer cette catégorie depuis A touchait les lignes de B : reassign_category_rows() reportait toutes les lignes de la catégorie, sans filtre de groupe, au niveau 2 des triggers où guard_viewer_write() ne bloque plus. Un membre rétrogradé lecteur dans B, ou une personne qui n'est même pas membre de B, pouvait ainsi changer ou effacer la catégorie de ses opérations, et en supprimer les budgets (on delete cascade) ;
--   - ces opérations sortaient de la répartition de B, dont la grille ne connaît pas la catégorie.
--
-- Le contrôle ne vaut que pour une catégorie nouvelle ou changée : une ligne déjà enregistrée ainsi reste modifiable sur ses autres champs (l'app renvoie category_id à chaque modification).
--
-- SECURITY INVOKER : le client qui écrit est membre du groupe et lit ses catégories comme les catégories par défaut ; une catégorie qu'il ne peut pas lire est de toute façon refusée.

create function public.check_category_group()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.category_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.category_id is not distinct from old.category_id then
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
  return new;
end;
$$;

revoke all on function public.check_category_group() from public, anon, authenticated;

create trigger transactions_check_category_group
  before insert or update of category_id on public.transactions
  for each row execute function public.check_category_group();

create trigger budgets_check_category_group
  before insert on public.budgets
  for each row execute function public.check_category_group();

create trigger recurring_transactions_check_category_group
  before insert or update of category_id on public.recurring_transactions
  for each row execute function public.check_category_group();

-- Le report ne touche plus que les lignes du groupe de la catégorie. Une ligne d'un autre groupe enregistrée avant ce contrôle garde le comportement sans report : on delete set null. Corps inchangé par ailleurs (20260930000100_category_management.sql).
create or replace function public.reassign_category_rows()
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

  update public.transactions set category_id = v_target
   where category_id = old.id and group_id = old.group_id;
  update public.recurring_transactions set category_id = v_target
   where category_id = old.id and group_id = old.group_id;

  return old;
end;
$$;
