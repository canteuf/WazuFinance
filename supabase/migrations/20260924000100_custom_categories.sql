-- Wazu Finance — catégories personnalisées (spec 2.3)
--
-- La policy categories_insert_member existe depuis le schéma initial, mais
-- l'app ne créait aucune catégorie : rien ne bornait donc ce qu'un appel direct
-- à l'API pouvait écrire. L'écran de création arrive ; la base pose ici les
-- règles qu'il suppose.

-- ---------------------------------------------------------------------------
-- 1. Forme du nom et de l'icône
-- ---------------------------------------------------------------------------

-- Nom déjà rogné (l'app le rogne avant l'envoi) et assez court pour tenir dans
-- une tuile de la grille. 30 couvre largement les catégories par défaut, dont
-- la plus longue (« Autres revenus ») fait 14 caractères.
alter table public.categories
  add constraint categories_name_format
  check (name = btrim(name) and char_length(name) between 1 and 30);

-- Un nom d'icône MaterialCommunityIcons, pas la liste elle-même : l'app choisit
-- dans une liste courte et retombe sur une icône neutre pour un nom inconnu,
-- comme users.avatar. Ajouter une icône ne demande donc aucune migration.
alter table public.categories
  add constraint categories_icon_format
  check (icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(icon) <= 40);

-- ---------------------------------------------------------------------------
-- 2. Pas d'homonymes, casse comprise, ni avec les catégories par défaut
-- ---------------------------------------------------------------------------

-- L'index d'origine distinguait « courses » de « Courses ». Il est remplacé par
-- son équivalent insensible à la casse ; il reste le filet contre deux membres
-- qui créent le même nom au même instant.
drop index public.categories_unique_group_name;

create unique index categories_unique_group_name
  on public.categories (group_id, lower(name), type)
  where group_id is not null;

-- Les deux index partiels ne se voient pas : une catégorie « Alimentation »
-- créée dans un groupe passait à côté de celle par défaut, et la grille aurait
-- montré deux tuiles identiques. Le trigger vérifie les deux portées et lève
-- P0001, dont l'app affiche le message tel quel (src/lib/data-errors.ts) —
-- 23505 n'aurait donné que le texte générique partagé avec les budgets.
--
-- security invoker : les catégories par défaut sont lisibles de tout
-- authentifié, et celles du groupe de tout membre, qui est le seul à pouvoir
-- écrire ici. Rien à contourner.
create or replace function public.guard_category_homonym()
returns trigger
language plpgsql
as $$
begin
  if new.group_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.categories c
    where c.type = new.type
      and lower(c.name) = lower(new.name)
      and c.id <> new.id
      and (c.group_id is null or c.group_id = new.group_id)
  ) then
    raise exception 'Une catégorie porte déjà ce nom.';
  end if;

  return new;
end;
$$;

create trigger categories_guard_homonym
  before insert or update of name, type, group_id on public.categories
  for each row execute function public.guard_category_homonym();

-- ---------------------------------------------------------------------------
-- 3. Colonnes modifiables
-- ---------------------------------------------------------------------------

-- La policy categories_update_member laissait changer group_id vers un autre
-- groupe du même membre, ce qui déplaçait la catégorie hors de portée des
-- opérations qui la référencent, et type, qui faisait passer une catégorie de
-- dépense sous les revenus avec ses dépenses. Même parti que users et
-- budget_groups : seuls le nom et l'icône se modifient.
revoke update on public.categories from authenticated;
grant update (name, icon) on public.categories to authenticated;
