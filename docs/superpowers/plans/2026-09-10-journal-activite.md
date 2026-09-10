# Journal d'activité — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garder la trace de chaque modification et suppression d'opération ou de budget — qui, quand, valeur avant et après — lisible par les membres du groupe dans un fil d'activité, avec une mention « modifié » sur les lignes concernées.

**Architecture:** Tout le journal est alimenté en base : un trigger `AFTER UPDATE OR DELETE` écrit dans `activity_log`, table où les clients n'ont que la lecture. La même migration rend `updated_at` fiable (il ne bouge plus sur un enregistrement sans changement), fige les colonnes d'appartenance et remet `updated_at` à zéro sur les données existantes. Côté app : une couche données paginée par curseur, un module pur de formatage couvert par Jest, un écran « Activité » ouvert depuis l'historique, et la mention « modifié » dans `TransactionRow` et `BudgetRow`.

**Tech Stack:** Expo SDK 57, expo-router v6 (typedRoutes), React 19.2, React Native 0.86, TypeScript strict, TanStack Query v5, Supabase (PostgREST), Postgres/plpgsql, pgTAP, Jest (jest-expo).

**Spec:** [docs/superpowers/specs/2026-09-10-journal-activite-design.md](../specs/2026-09-10-journal-activite-design.md)

## Global Constraints

- TypeScript strict, **aucun `any`**.
- Chaînes visibles en français, identifiants de code en anglais. Commentaires SQL en français. Les descriptions d'assertions pgTAP s'écrivent sans accents, comme dans les fichiers de test existants.
- Fichiers en kebab-case, composants en PascalCase.
- `src/types/database.ts` est **généré** — ne jamais l'éditer à la main, sauf l'en-tête et les alias d'enums en fin de fichier, à remettre après régénération.
- Couches à sens unique : `écrans → hooks → src/data/ → supabase`. Un écran n'importe jamais `supabase` ; `src/data/` n'importe jamais React.
- Toutes les clés de cache vivent dans `src/lib/query-keys.ts`.
- Les erreurs de données passent par `dataErrorMessage()` de `src/lib/data-errors.ts`.
- **Un enfant de `<Link asChild>` reçoit un `style` passé par `StyleSheet.flatten(...)`, jamais un tableau.** L'erreur ne se voit qu'en mode développement sur appareil : ni `tsc`, ni le lint, ni Jest, ni `npx expo export` ne la signalent.
- Dans du texte JSX, écrire l'apostrophe typographique `’` (U+2019) : `react/no-unescaped-entities` échoue sur l'apostrophe droite.
- Vérification à chaque tâche : `npx tsc --noEmit` **et** `npm run lint` propres.
- `npm run test:db` exige Docker Desktop démarré puis `npx supabase start`. Après avoir ajouté ou modifié une migration, `npx supabase db reset` la réapplique au stack local. **Si Docker ne démarre pas, s'arrêter et le signaler — ne jamais sauter les tests de base.**
- **Aucun `npx supabase db push` hors de la tâche 4**, et celle-ci attend l'accord explicite de l'utilisateur : la migration écrit sur les données de production de façon irréversible.
- Ne jamais lancer `npm audit fix --force`.
- Un commit par tâche. Aucun `git push` sans demande de l'utilisateur.

---

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/20260910000100_activity_log.sql` | `updated_at` fiable, colonnes figées, remise à zéro, table et trigger de journal. |
| `supabase/tests/activity_log_test.sql` | pgTAP : les quinze cas de la spec. |
| `src/lib/activity-format.ts` | Module pur : phrase d'une entrée, heure d'une entrée, test « modifié ». |
| `src/lib/activity-format.test.ts` | Tests Jest du module ci-dessus. |
| `src/data/activity.ts` | Lecture paginée du journal via PostgREST. |
| `src/hooks/use-activity.ts` | Requête infinie sur le journal du groupe actif. |
| `src/app/(app)/activity.tsx` | Écran « Activité ». |

**Modifiés :**

| Fichier | Modification |
|---|---|
| `src/types/database.ts` | Régénéré (tâche 4) + alias `ActivitySubject`, `ActivityAction`. |
| `src/lib/query-keys.ts` | Ajout de `activity(groupId)`. |
| `src/hooks/use-categories.ts` | Expose `retry`. |
| `src/app/(app)/_layout.tsx` | Enregistre la route `activity`. |
| `src/app/(app)/history.tsx` | Lien « Activité » dans l'en-tête. |
| `src/components/transaction/transaction-row.tsx` | Mention « modifié ». |
| `src/components/budget/budget-row.tsx` | Mention « modifié ». |
| `CLAUDE.md` | Règles acquises (tâches 2 et 5). |

**Ordre et dépendances :** tâches 1 → 2 (base, locale) ; tâche 3 (module pur) indépendante ; tâche 4 (déploiement + types) après 1 et 2 ; tâches 5 → 6 après 4, car `Tables<'activity_log'>` n'existe qu'une fois les types régénérés ; tâche 7 après 3.

---

## Task 1: `updated_at` fiable et colonnes figées

**Files:**
- Create: `supabase/migrations/20260910000100_activity_log.sql` (sections 1 à 3)
- Create: `supabase/tests/activity_log_test.sql` (fixtures + 6 assertions)

**Interfaces:**
- Consumes: `public.touch_updated_at()` et ses trois triggers `*_touch_updated_at`, définis dans `20260904000100_schema.sql`.
- Produces:
  - `public.touch_updated_at()` remplacée : `updated_at` ne change que si une autre colonne change, et la valeur envoyée par le client est toujours ignorée.
  - `public.guard_immutable_columns()` : trigger `BEFORE UPDATE` générique, colonnes passées en arguments ; lève `42501` avec le message exact `Colonne <nom> non modifiable`.
  - Triggers `transactions_guard_immutable` (`user_id`, `group_id`) et `budgets_guard_immutable` (`group_id`, `category_id`).
  - Remise à zéro `updated_at = created_at` sur `transactions` et `budgets`.
  - Fixtures pgTAP réutilisées telles quelles par la tâche 2 : Alice `…f1` (propriétaire), Bob `…f2`, Carole `…f3` ; groupes `…f4` (Colocation) et `…f5` (Vacances) ; opérations `…fa`, `…fb`, `…fc`, `…f6` ; budgets `…fd`, `…f7`.

- [ ] **Step 1: Écrire le test pgTAP (6 assertions)**

Créer `supabase/tests/activity_log_test.sql` :

```sql
-- Journal d'activité, updated_at fiable et colonnes figées.
--
-- Spec : docs/superpowers/specs/2026-09-10-journal-activite-design.md. Les
-- mentions « spec n » renvoient à la liste de tests de la spec.
--
-- Deux membres d'un groupe partagé, Alice (propriétaire) et Bob, et une
-- étrangère, Carole. Alice possède le groupe : si c'était Bob, supprimer son
-- compte emporterait le groupe entier (budget_groups.owner_id est en cascade)
-- et les tests de suppression de compte ne prouveraient rien.
--
-- now() est figé pour toute la transaction du test. Les fixtures datent donc
-- created_at et updated_at d'un instant passé explicite : sans cela, « updated_at
-- a bougé » et « updated_at n'a pas bougé » seraient indiscernables.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'alice@example.com',  '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f2', 'bob@example.com',    '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f3', 'carole@example.com', '{"display_name": "Carole"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal) values
  ('00000000-0000-0000-0000-0000000000f4', 'Colocation',
   '00000000-0000-0000-0000-0000000000f1', false),
  ('00000000-0000-0000-0000-0000000000f5', 'Vacances',
   '00000000-0000-0000-0000-0000000000f1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f1', 'owner'),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2', 'member'),
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f1', 'owner');

insert into public.transactions
  (id, group_id, user_id, category_id, type, amount, occurred_on, note, created_at, updated_at)
values
  -- Saisie par Alice, modifiée par Bob plus bas.
  ('00000000-0000-0000-0000-0000000000fa',
   '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 15.00, '2026-09-08', 'Carrefour',
   '2026-09-01 10:00+00', '2026-09-01 10:00+00'),
  -- Saisie par Bob : disparaît avec son compte.
  ('00000000-0000-0000-0000-0000000000fb',
   '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2',
   (select id from public.categories where group_id is null and name = 'Restaurants'),
   'expense', 42.00, '2026-09-08', null,
   '2026-09-01 10:00+00', '2026-09-01 10:00+00'),
  -- Saisie par Alice, supprimée par Bob plus bas.
  ('00000000-0000-0000-0000-0000000000fc',
   '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Transport'),
   'expense', 20.00, '2026-09-08', null,
   '2026-09-01 10:00+00', '2026-09-01 10:00+00'),
  -- Dans le groupe Vacances, supprimé en entier plus bas.
  ('00000000-0000-0000-0000-0000000000f6',
   '00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Loisirs'),
   'expense', 80.00, '2026-09-08', null,
   '2026-09-01 10:00+00', '2026-09-01 10:00+00');

insert into public.budgets (id, group_id, category_id, period, amount, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000fd', '00000000-0000-0000-0000-0000000000f4',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'monthly', 300.00, '2026-09-01 10:00+00', '2026-09-01 10:00+00'),
  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f5',
   (select id from public.categories where group_id is null and name = 'Loisirs'),
   'monthly', 200.00, '2026-09-01 10:00+00', '2026-09-01 10:00+00');

-- ---------------------------------------------------------------------------
-- Bob, membre du groupe partagé
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);

-- spec 3 : ce que fait l'app quand on enregistre un formulaire sans rien changer.
update public.transactions set amount = amount
 where id = '00000000-0000-0000-0000-0000000000fa';

SELECT is(
  (select updated_at from public.transactions where id = '00000000-0000-0000-0000-0000000000fa'),
  '2026-09-01 10:00+00'::timestamptz,
  'Une mise a jour sans changement laisse updated_at intact'
);

-- spec 4 : sans cette règle, une seconde mise à jour réglant updated_at sur
-- created_at effacerait la mention « modifié » après coup.
update public.transactions set updated_at = '2000-01-01 00:00+00'
 where id = '00000000-0000-0000-0000-0000000000fa';

SELECT is(
  (select updated_at from public.transactions where id = '00000000-0000-0000-0000-0000000000fa'),
  '2026-09-01 10:00+00'::timestamptz,
  'Une valeur de updated_at envoyee par le client est ignoree'
);

-- Le pendant : un vrai changement date updated_at de l'instant, même si le
-- client envoie une autre valeur dans la même requête.
update public.transactions set note = 'Train', updated_at = '2000-01-01 00:00+00'
 where id = '00000000-0000-0000-0000-0000000000fc';

SELECT is(
  (select updated_at from public.transactions where id = '00000000-0000-0000-0000-0000000000fc'),
  now(),
  'Un vrai changement date updated_at de l''instant, pas de la valeur envoyee'
);

-- spec 10, 11, 12. Le message est vérifié en plus du code : 42501 est aussi
-- le code d'un refus RLS, et seul le message prouve que c'est le trigger qui
-- a refusé.
SELECT throws_ok(
  $$update public.transactions set user_id = '00000000-0000-0000-0000-0000000000f1'
     where id = '00000000-0000-0000-0000-0000000000fb'$$,
  '42501',
  'Colonne user_id non modifiable',
  'Changer l''auteur d''une operation est refuse'
);

-- Vers le groupe personnel de Bob, dont il est membre : la policy laisserait
-- passer, seul le trigger peut refuser.
SELECT throws_ok(
  $$update public.transactions
       set group_id = (select id from public.budget_groups
                        where owner_id = '00000000-0000-0000-0000-0000000000f2' and is_personal)
     where id = '00000000-0000-0000-0000-0000000000fb'$$,
  '42501',
  'Colonne group_id non modifiable',
  'Deplacer une operation vers un autre groupe est refuse'
);

SELECT throws_ok(
  $$update public.budgets
       set category_id = (select id from public.categories where group_id is null and name = 'Transport')
     where id = '00000000-0000-0000-0000-0000000000fd'$$,
  '42501',
  'Colonne category_id non modifiable',
  'Changer la categorie d''un budget est refuse'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Lancer le test et constater l'échec**

Run: `npm run test:db`
Expected: `activity_log_test.sql` en échec sur 5 des 6 assertions. Les deux premières échouent parce que l'ancien `touch_updated_at` écrit `now()`, et les trois `throws_ok` parce qu'aucune erreur n'est levée. La troisième passe déjà. Les autres fichiers restent au vert.

- [ ] **Step 3: Écrire les sections 1 à 3 de la migration**

Créer `supabase/migrations/20260910000100_activity_log.sql` :

```sql
-- Wazu Finance — journal d'activité (traçabilité niveau 3)
--
-- Dans un budget partagé, tout membre peut modifier ou supprimer n'importe
-- quelle ligne du groupe. Cette migration garde la trace de qui a changé quoi,
-- de la valeur d'avant, et de qui a supprimé une ligne qui n'existe plus.
--
-- Spec : docs/superpowers/specs/2026-09-10-journal-activite-design.md
--
-- Ordre : (1) updated_at fiable, (2) colonnes figées, (3) remise à zéro de
-- updated_at, (4) journal. La remise à zéro précède les triggers de journal.

-- ---------------------------------------------------------------------------
-- 1. updated_at ne bouge que sur un changement réel
-- ---------------------------------------------------------------------------

-- Remplace la version du schéma initial, qui écrivait now() à chaque UPDATE :
-- un enregistrement sans changement marquait la ligne comme modifiée. La
-- comparaison ignore updated_at, avec la même expression que log_activity(),
-- pour que la mention « modifié » et le journal soient toujours d'accord.
--
-- La valeur envoyée par le client est ignorée dans les deux branches : sans
-- cela, une seconde mise à jour réglant updated_at sur created_at effacerait
-- la mention après coup.
--
-- Partagée par transactions, budgets et savings_goals.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Colonnes figées
-- ---------------------------------------------------------------------------

-- L'app ne modifie jamais ces colonnes ; la policy de modification, elle, les
-- laissait libres, et un appel direct à l'API pouvait réattribuer une dépense
-- ou la déplacer de groupe. Les figer rend « créé par » digne de foi et garde
-- chaque entrée du journal dans un seul groupe.
--
-- Générique : les colonnes arrivent en arguments du trigger. 42501 est déjà
-- traduit par src/lib/data-errors.ts.
create or replace function public.guard_immutable_columns()
returns trigger
language plpgsql
as $$
declare
  col text;
begin
  foreach col in array tg_argv loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      raise exception 'Colonne % non modifiable', col
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create trigger transactions_guard_immutable
  before update on public.transactions
  for each row execute function public.guard_immutable_columns('user_id', 'group_id');

-- category_id aussi : l'interface verrouille déjà la catégorie en édition, la
-- base s'aligne dessus.
create trigger budgets_guard_immutable
  before update on public.budgets
  for each row execute function public.guard_immutable_columns('group_id', 'category_id');

-- ---------------------------------------------------------------------------
-- 3. Remise à zéro de updated_at — écrit sur les données existantes
-- ---------------------------------------------------------------------------

-- Les dates de modification actuelles ne valent rien : un enregistrement sans
-- changement les faisait bouger. Sans remise à zéro, des lignes jamais
-- réellement modifiées afficheraient « modifié » à vie. Le journal comme la
-- mention commencent donc au jour de cette migration. Irréversible.
--
-- Les triggers updated_at sont coupés le temps de l'opération, et ce n'est pas
-- une précaution de confort : l'ancienne version réécrirait now() sur chaque
-- ligne, la nouvelle — qui ignore la valeur envoyée — rétablirait
-- old.updated_at. Dans les deux cas la remise à zéro n'aurait aucun effet.
alter table public.transactions disable trigger transactions_touch_updated_at;
alter table public.budgets disable trigger budgets_touch_updated_at;

update public.transactions set updated_at = created_at where updated_at <> created_at;
update public.budgets set updated_at = created_at where updated_at <> created_at;

alter table public.transactions enable trigger transactions_touch_updated_at;
alter table public.budgets enable trigger budgets_touch_updated_at;
```

- [ ] **Step 4: Réappliquer les migrations et lancer les tests**

Run: `npx supabase db reset` puis `npm run test:db`
Expected: tous les fichiers au vert, `activity_log_test.sql` compris (6/6). `transactions_rls_test.sql`, `budgets_rls_test.sql` et `handle_new_user_test.sql` restent verts.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260910000100_activity_log.sql supabase/tests/activity_log_test.sql
git commit -m "feat(db): updated_at fiable et colonnes figees sur transactions et budgets"
```

---

## Task 2: Table et trigger de journal

**Files:**
- Modify: `supabase/migrations/20260910000100_activity_log.sql` (ajout de la section 4 en fin de fichier)
- Modify: `supabase/tests/activity_log_test.sql` (remplacé par la version complète, 28 assertions)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: la migration et les fixtures de la tâche 1 ; `public.is_group_member(uuid)` ; `auth.uid()`.
- Produces:
  - Enums `public.activity_subject` (`'transaction' | 'budget'`) et `public.activity_action` (`'update' | 'delete'`).
  - Table `public.activity_log` : `id uuid`, `group_id uuid`, `subject activity_subject`, `subject_id uuid`, `action activity_action`, `actor_id uuid null`, `actor_name text null`, `old_values jsonb`, `new_values jsonb null`, `changed_fields text[]`, `occurred_at timestamptz`.
  - Index `activity_log_group_occurred_idx (group_id, occurred_at desc, id desc)`, sur lequel la pagination de la tâche 5 s'appuie.
  - Droits : `select` pour `authenticated` via `activity_log_select_member`, rien d'autre pour personne.
  - `public.log_activity()`, `SECURITY DEFINER`, déclenché par `transactions_log_activity` et `budgets_log_activity`.

- [ ] **Step 1: Remplacer le test par sa version complète**

Remplacer **tout** le contenu de `supabase/tests/activity_log_test.sql`. En-tête, fixtures et assertions de la tâche 1 sont repris à l'identique, la seule différence étant `plan(28)`. Les assertions du journal viennent s'intercaler et s'ajouter :

```sql
-- Journal d'activité, updated_at fiable et colonnes figées.
--
-- Spec : docs/superpowers/specs/2026-09-10-journal-activite-design.md. Les
-- mentions « spec n » renvoient à la liste de tests de la spec.
--
-- Deux membres d'un groupe partagé, Alice (propriétaire) et Bob, et une
-- étrangère, Carole. Alice possède le groupe : si c'était Bob, supprimer son
-- compte emporterait le groupe entier (budget_groups.owner_id est en cascade)
-- et les tests de suppression de compte ne prouveraient rien.
--
-- now() est figé pour toute la transaction du test. Les fixtures datent donc
-- created_at et updated_at d'un instant passé explicite : sans cela, « updated_at
-- a bougé » et « updated_at n'a pas bougé » seraient indiscernables.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(28);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'alice@example.com',  '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f2', 'bob@example.com',    '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f3', 'carole@example.com', '{"display_name": "Carole"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal) values
  ('00000000-0000-0000-0000-0000000000f4', 'Colocation',
   '00000000-0000-0000-0000-0000000000f1', false),
  ('00000000-0000-0000-0000-0000000000f5', 'Vacances',
   '00000000-0000-0000-0000-0000000000f1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f1', 'owner'),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2', 'member'),
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f1', 'owner');

insert into public.transactions
  (id, group_id, user_id, category_id, type, amount, occurred_on, note, created_at, updated_at)
values
  -- Saisie par Alice, modifiée par Bob plus bas.
  ('00000000-0000-0000-0000-0000000000fa',
   '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 15.00, '2026-09-08', 'Carrefour',
   '2026-09-01 10:00+00', '2026-09-01 10:00+00'),
  -- Saisie par Bob : disparaît avec son compte.
  ('00000000-0000-0000-0000-0000000000fb',
   '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2',
   (select id from public.categories where group_id is null and name = 'Restaurants'),
   'expense', 42.00, '2026-09-08', null,
   '2026-09-01 10:00+00', '2026-09-01 10:00+00'),
  -- Saisie par Alice, supprimée par Bob plus bas.
  ('00000000-0000-0000-0000-0000000000fc',
   '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Transport'),
   'expense', 20.00, '2026-09-08', null,
   '2026-09-01 10:00+00', '2026-09-01 10:00+00'),
  -- Dans le groupe Vacances, supprimé en entier plus bas.
  ('00000000-0000-0000-0000-0000000000f6',
   '00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f1',
   (select id from public.categories where group_id is null and name = 'Loisirs'),
   'expense', 80.00, '2026-09-08', null,
   '2026-09-01 10:00+00', '2026-09-01 10:00+00');

insert into public.budgets (id, group_id, category_id, period, amount, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000fd', '00000000-0000-0000-0000-0000000000f4',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'monthly', 300.00, '2026-09-01 10:00+00', '2026-09-01 10:00+00'),
  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f5',
   (select id from public.categories where group_id is null and name = 'Loisirs'),
   'monthly', 200.00, '2026-09-01 10:00+00', '2026-09-01 10:00+00');

-- ---------------------------------------------------------------------------
-- Bob, membre du groupe partagé
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);

-- spec 3 : ce que fait l'app quand on enregistre un formulaire sans rien changer.
update public.transactions set amount = amount
 where id = '00000000-0000-0000-0000-0000000000fa';

SELECT is(
  (select updated_at from public.transactions where id = '00000000-0000-0000-0000-0000000000fa'),
  '2026-09-01 10:00+00'::timestamptz,
  'Une mise a jour sans changement laisse updated_at intact'
);

-- spec 4 : sans cette règle, une seconde mise à jour réglant updated_at sur
-- created_at effacerait la mention « modifié » après coup.
update public.transactions set updated_at = '2000-01-01 00:00+00'
 where id = '00000000-0000-0000-0000-0000000000fa';

SELECT is(
  (select updated_at from public.transactions where id = '00000000-0000-0000-0000-0000000000fa'),
  '2026-09-01 10:00+00'::timestamptz,
  'Une valeur de updated_at envoyee par le client est ignoree'
);

-- spec 2 : les deux mises à jour ci-dessus ne changent rien d'autre que
-- updated_at, et n'écrivent donc rien.
SELECT is(
  (select count(*)::int from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fa'),
  0,
  'Une mise a jour sans changement reel n''ecrit aucune entree'
);

-- Le pendant : un vrai changement date updated_at de l'instant, même si le
-- client envoie une autre valeur dans la même requête.
update public.transactions set note = 'Train', updated_at = '2000-01-01 00:00+00'
 where id = '00000000-0000-0000-0000-0000000000fc';

SELECT is(
  (select updated_at from public.transactions where id = '00000000-0000-0000-0000-0000000000fc'),
  now(),
  'Un vrai changement date updated_at de l''instant, pas de la valeur envoyee'
);

-- spec 10, 11, 12. Le message est vérifié en plus du code : 42501 est aussi
-- le code d'un refus RLS, et seul le message prouve que c'est le trigger qui
-- a refusé.
SELECT throws_ok(
  $$update public.transactions set user_id = '00000000-0000-0000-0000-0000000000f1'
     where id = '00000000-0000-0000-0000-0000000000fb'$$,
  '42501',
  'Colonne user_id non modifiable',
  'Changer l''auteur d''une operation est refuse'
);

-- Vers le groupe personnel de Bob, dont il est membre : la policy laisserait
-- passer, seul le trigger peut refuser.
SELECT throws_ok(
  $$update public.transactions
       set group_id = (select id from public.budget_groups
                        where owner_id = '00000000-0000-0000-0000-0000000000f2' and is_personal)
     where id = '00000000-0000-0000-0000-0000000000fb'$$,
  '42501',
  'Colonne group_id non modifiable',
  'Deplacer une operation vers un autre groupe est refuse'
);

SELECT throws_ok(
  $$update public.budgets
       set category_id = (select id from public.categories where group_id is null and name = 'Transport')
     where id = '00000000-0000-0000-0000-0000000000fd'$$,
  '42501',
  'Colonne category_id non modifiable',
  'Changer la categorie d''un budget est refuse'
);

-- spec 1 : Bob modifie une opération saisie par Alice.
update public.transactions set amount = 150.00
 where id = '00000000-0000-0000-0000-0000000000fa';

SELECT is(
  (select actor_id from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fa'),
  '00000000-0000-0000-0000-0000000000f2'::uuid,
  'L''entree designe Bob, auteur de la modification, pas Alice, auteur de la saisie'
);

SELECT is(
  (select actor_name from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fa'),
  'Bob',
  'L''entree garde le nom de l''auteur au moment de l''action'
);

SELECT is(
  (select changed_fields from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fa'),
  array['amount']::text[],
  'changed_fields ne liste que la colonne modifiee, sans updated_at'
);

SELECT is(
  (select (old_values ->> 'amount')::numeric from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fa'),
  15.00::numeric,
  'old_values porte le montant d''avant'
);

SELECT is(
  (select (new_values ->> 'amount')::numeric from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fa'),
  150.00::numeric,
  'new_values porte le montant d''apres'
);

-- spec 5 : Bob supprime une opération saisie par Alice.
delete from public.transactions where id = '00000000-0000-0000-0000-0000000000fc';

SELECT is(
  (select count(*)::int from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fc' and action = 'delete'),
  1,
  'Une suppression ecrit une entree delete'
);

SELECT is(
  (select (old_values ->> 'amount')::numeric from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fc' and action = 'delete'),
  20.00::numeric,
  'L''entree de suppression garde la ligne disparue'
);

SELECT ok(
  (select new_values is null and changed_fields = '{}'::text[] from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fc' and action = 'delete'),
  'Une suppression n''a ni new_values ni changed_fields'
);

-- spec 6
update public.budgets set amount = 350.00
 where id = '00000000-0000-0000-0000-0000000000fd';

SELECT is(
  (select count(*)::int from public.activity_log
    where subject = 'budget'
      and subject_id = '00000000-0000-0000-0000-0000000000fd'
      and action = 'update'
      and changed_fields = array['amount']::text[]),
  1,
  'La modification d''un plafond est journalisee'
);

-- ---------------------------------------------------------------------------
-- Alice, membre : lit le journal, ne peut pas y écrire (spec 8, 9)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

SELECT throws_ok(
  $$insert into public.activity_log (group_id, subject, subject_id, action, old_values, changed_fields)
    values ('00000000-0000-0000-0000-0000000000f4', 'transaction',
            '00000000-0000-0000-0000-0000000000fa', 'delete', '{}'::jsonb, '{}')$$,
  '42501',
  NULL,
  'Un membre ne peut pas ecrire dans le journal'
);

-- Les droits sont retirés en plus de l'absence de policy : ces deux requêtes
-- lèvent une erreur au lieu de ne toucher aucune ligne. La relecture en
-- postgres plus bas prouve, elle, que rien n'a changé.
SELECT throws_ok(
  $$update public.activity_log set actor_name = 'Alice'$$,
  '42501',
  NULL,
  'Un membre ne peut pas reecrire une entree'
);

SELECT throws_ok(
  $$delete from public.activity_log$$,
  '42501',
  NULL,
  'Un membre ne peut pas effacer une entree'
);

-- ---------------------------------------------------------------------------
-- Carole, étrangère au groupe (spec 7)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.activity_log
    where group_id = '00000000-0000-0000-0000-0000000000f4'),
  0,
  'Un non-membre ne lit aucune entree du groupe'
);

-- ---------------------------------------------------------------------------
-- Retour en postgres pour constater l'état réel, hors RLS
-- ---------------------------------------------------------------------------

set local role postgres;

-- Quatre entrées : la note de …fc, le montant de …fa, la suppression de …fc,
-- le plafond de …fd.
SELECT is(
  (select count(*)::int from public.activity_log
    where group_id = '00000000-0000-0000-0000-0000000000f4'),
  4,
  'Les quatre entrees du groupe sont intactes'
);

SELECT is(
  (select actor_name from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fa'),
  'Bob',
  'Aucune entree n''a ete reecrite par Alice'
);

-- spec 13 : supprimer un groupe supprime ses opérations et ses budgets en
-- cascade. Sans le garde de log_activity(), le trigger voudrait journaliser
-- ces suppressions dans un groupe déjà effacé, la clé étrangère lèverait une
-- erreur, et toute la suppression du groupe serait annulée.
SELECT lives_ok(
  $$delete from public.budget_groups where id = '00000000-0000-0000-0000-0000000000f5'$$,
  'Supprimer un groupe qui contient des operations et des budgets reussit'
);

SELECT is(
  (select count(*)::int from public.activity_log
    where group_id = '00000000-0000-0000-0000-0000000000f5'),
  0,
  'Un groupe supprime ne laisse aucune entree'
);

-- spec 14, 15 : Bob supprime son propre compte — la session est la sienne.
-- Ses opérations dans le groupe partagé partent en cascade et sont
-- journalisées ; son profil users est déjà effacé à ce moment-là. Si
-- log_activity() prenait auth.uid() tel quel, il insérerait un actor_id qui
-- ne pointe plus vers rien, la clé étrangère lèverait une erreur et la
-- suppression du compte serait annulée.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);

SELECT lives_ok(
  $$delete from auth.users where id = '00000000-0000-0000-0000-0000000000f2'$$,
  'Bob peut supprimer son compte : l''auteur est lu dans users, pas pris a auth.uid()'
);

SELECT is(
  (select count(*)::int from public.activity_log
    where group_id = '00000000-0000-0000-0000-0000000000f4'
      and actor_name = 'Bob'
      and actor_id is null),
  4,
  'Les entrees de Bob survivent a son compte, a son nom, sans actor_id'
);

SELECT is(
  (select count(*)::int from public.activity_log
    where group_id = '00000000-0000-0000-0000-0000000000f4'
      and actor_id is not null),
  0,
  'Aucune entree ne pointe plus vers le compte supprime'
);

SELECT is(
  (select count(*)::int from public.activity_log
    where subject_id = '00000000-0000-0000-0000-0000000000fb'
      and action = 'delete'
      and actor_id is null
      and actor_name is null),
  1,
  'La suppression en cascade de l''operation de Bob est journalisee, sans auteur'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Lancer le test et constater l'échec**

Run: `npm run test:db`
Expected: `activity_log_test.sql` échoue : `relation "public.activity_log" does not exist`.

- [ ] **Step 3: Ajouter la section 4 à la migration**

Ajouter **à la fin** de `supabase/migrations/20260910000100_activity_log.sql` :

```sql

-- ---------------------------------------------------------------------------
-- 4. Journal
-- ---------------------------------------------------------------------------

create type public.activity_subject as enum ('transaction', 'budget');
create type public.activity_action as enum ('update', 'delete');

-- subject_id n'a pas de clé étrangère : la ligne visée peut avoir été
-- supprimée, et c'est précisément le cas qu'on veut garder.
--
-- actor_id passe à null si l'auteur supprime son compte ; actor_name garde son
-- nom tel qu'il était au moment de l'action. Les deux sont null pour une
-- action faite hors session (console SQL, clé de service) : le journal ne
-- prétend pas connaître un auteur qu'il n'a pas.
--
-- new_values est null pour une suppression, et changed_fields y est vide.
--
-- La table n'est pas dans la publication Realtime : le fil se consulte
-- délibérément et se recharge à l'ouverture.
create table public.activity_log (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.budget_groups (id) on delete cascade,
  subject        public.activity_subject not null,
  subject_id     uuid not null,
  action         public.activity_action not null,
  actor_id       uuid references public.users (id) on delete set null,
  actor_name     text,
  old_values     jsonb not null,
  new_values     jsonb,
  changed_fields text[] not null,
  occurred_at    timestamptz not null default now()
);

-- Couvre le filtre groupe + le tri du fil, et le départage par id rend la
-- pagination par curseur stable quand deux entrées partagent un instant.
create index activity_log_group_occurred_idx
  on public.activity_log (group_id, occurred_at desc, id desc);

alter table public.activity_log enable row level security;

-- Lecture : tout membre du groupe, et lui seul. Un membre qui quitte le groupe
-- perd l'accès.
create policy "activity_log_select_member"
  on public.activity_log for select to authenticated
  using (public.is_group_member(group_id));

-- Écriture : aucune policy, et les droits sont retirés en plus de RLS. Les
-- privilèges par défaut de Supabase donnent tout à anon et authenticated sur
-- une table neuve ; on repart de rien et on ne rend que la lecture. Seuls les
-- triggers écrivent.
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;

-- security definer, et ce n'est pas par imitation des fonctions
-- d'appartenance : le trigger doit insérer dans une table où les clients n'ont
-- délibérément aucun droit d'écriture. Leur donner ce droit pour que le
-- trigger tourne en security invoker leur permettrait d'écrire eux-mêmes de
-- fausses entrées. Une fonction de trigger n'est pas appelable comme RPC.
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb;
  v_changed text[];
  v_actor_id uuid;
  v_actor_name text;
begin
  -- 1. Groupe disparu : on est dans la cascade d'une suppression de groupe ou
  -- de compte. La ligne parente n'est déjà plus visible ; insérer une entrée
  -- qui la désigne ferait échouer la clé étrangère et annulerait toute la
  -- suppression. Un journal n'a de sens que pour un groupe qui existe encore.
  if not exists (select 1 from public.budget_groups where id = old.group_id) then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    v_new := to_jsonb(new);

    -- 2. Même comparaison que touch_updated_at() : updated_at ignoré. Aucune
    -- autre différence, aucune entrée.
    select coalesce(array_agg(n.key order by n.key), '{}')
      into v_changed
      from jsonb_each(v_new - 'updated_at') as n (key, value)
     where n.value is distinct from (v_old -> n.key);

    if cardinality(v_changed) = 0 then
      return null;
    end if;
  else
    v_changed := '{}';
  end if;

  -- 3. L'auteur est lu dans users, jamais pris à auth.uid() directement. Pendant
  -- la cascade d'une suppression de compte faite par son titulaire, sa ligne
  -- users est déjà effacée : un actor_id pris tel quel ferait échouer la clé
  -- étrangère, et la suppression du compte serait annulée. Ligne absente, les
  -- deux restent null.
  select u.id, u.display_name
    into v_actor_id, v_actor_name
    from public.users u
   where u.id = auth.uid();

  insert into public.activity_log (
    group_id, subject, subject_id, action,
    actor_id, actor_name, old_values, new_values, changed_fields
  ) values (
    old.group_id, tg_argv[0]::public.activity_subject, old.id, lower(tg_op)::public.activity_action,
    v_actor_id, v_actor_name, v_old, v_new, v_changed
  );

  return null;
end;
$$;

revoke all on function public.log_activity() from public, anon, authenticated;

-- Modifications et suppressions seulement : une création est entièrement
-- décrite par la ligne elle-même (auteur, date). Brancher une nouvelle table
-- tient en un trigger de plus et une valeur de plus dans activity_subject.
create trigger transactions_log_activity
  after update or delete on public.transactions
  for each row execute function public.log_activity('transaction');

create trigger budgets_log_activity
  after update or delete on public.budgets
  for each row execute function public.log_activity('budget');
```

- [ ] **Step 4: Réappliquer les migrations et lancer les tests**

Run: `npx supabase db reset` puis `npm run test:db`
Expected: tous les fichiers au vert, `activity_log_test.sql` compris (28/28), et `handle_new_user_test.sql` resté vert (il supprime des comptes, donc traverse les nouveaux triggers).

Si `revoke all on function public.log_activity()` fait échouer les écritures des membres (`permission denied for function log_activity`), retirer cette seule ligne et le signaler dans le rapport : le déclenchement d'un trigger ne devrait pas vérifier ce droit, mais c'est le test qui tranche.

- [ ] **Step 5: Documenter dans `CLAUDE.md`**

Dans la section `## Core data model decision`, remplacer la ligne :

```
Tables: `users`, `budget_groups`, `account_memberships`, `categories` (`group_id IS NULL` = read-only global default), `transactions`, `budgets`, `savings_goals`, `group_invitations`.
```

par :

```
Tables: `users`, `budget_groups`, `account_memberships`, `categories` (`group_id IS NULL` = read-only global default), `transactions`, `budgets`, `savings_goals`, `group_invitations`, `activity_log` (written by triggers only — see below).
```

Puis insérer, juste avant la ligne `## V1 scope (decided — do not re-litigate)`, cette nouvelle section :

```markdown
## Activity log

`activity_log` records every update and delete on `transactions` and `budgets`: who, when, the row before and after. It is written only by the `log_activity()` trigger. Clients hold `select` and nothing else — no policy and no privilege for insert, update or delete — so no client can add, rewrite or erase an entry, including through a direct API call.

`log_activity()` is `SECURITY DEFINER` for its own reason, not by imitation of the membership helpers: it inserts into a table where clients deliberately have no write right. Two guards keep it from breaking cascades, and both are covered by `activity_log_test.sql`:

- it writes nothing when the row's group no longer exists — deleting a group or an account cascades into transactions and budgets, and an entry pointing at a deleted group would fail its foreign key and roll the whole deletion back;
- it reads the author from `users` rather than taking `auth.uid()` as is — when users delete their own account, their `users` row is already gone during the cascade.

To journal another table: one `create trigger … execute function public.log_activity('<subject>')` and one more value in the `activity_subject` enum.

`updated_at` moves only on a real change: `touch_updated_at()` compares the row with and without `updated_at`, and ignores any value the client sends. That is what makes « modifié » (`updated_at > created_at`) trustworthy. `log_activity()` uses the same comparison, so the mention and the log always agree.

`transactions.user_id`, `transactions.group_id`, `budgets.group_id` and `budgets.category_id` are frozen: `guard_immutable_columns()` raises `42501` on any change. The app never edits them; the update policies alone did not prevent it.
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260910000100_activity_log.sql supabase/tests/activity_log_test.sql CLAUDE.md
git commit -m "feat(db): journal d'activite alimente par trigger sur transactions et budgets"
```

---

## Task 3: Module de formatage du journal

**Files:**
- Create: `src/lib/activity-format.ts`
- Create: `src/lib/activity-format.test.ts`

**Interfaces:**
- Consumes: `Json` de `@/types/database` (déjà présent) ; `dateToIso`, `isoToDate` de `@/lib/dates` ; `formatAmount` de `@/lib/money`.
- Produces:
  ```ts
  export type ActivityLogRow = {
    subject: 'transaction' | 'budget';
    action: 'update' | 'delete';
    actor_id: string | null;
    actor_name: string | null;
    old_values: Json;
    new_values: Json | null;
    changed_fields: string[];
  };
  export type CategoryName = { id: string; name: string };
  export function formatActivity(
    entry: ActivityLogRow,
    currentUserId: string | null,
    categories: readonly CategoryName[]
  ): string;
  export function formatActivityTime(occurredAt: string, now?: Date): string;
  export function wasEdited(row: { created_at: string; updated_at: string }): boolean;
  ```
  `ActivityLogRow` est structurel à dessein : `Tables<'activity_log'>`, qui n'existera qu'après la tâche 4, lui sera assignable. Ce module ne dépend donc pas de la régénération des types.

- [ ] **Step 1: Écrire les tests**

Créer `src/lib/activity-format.test.ts` :

```ts
import {
  formatActivity,
  formatActivityTime,
  wasEdited,
  type ActivityLogRow,
  type CategoryName,
} from '@/lib/activity-format';

const categories: CategoryName[] = [
  { id: 'cat-alim', name: 'Alimentation' },
  { id: 'cat-resto', name: 'Restaurants' },
];

const operation = {
  category_id: 'cat-resto',
  amount: 15,
  occurred_on: '2026-09-08',
  type: 'expense',
  note: null,
};

function entry(overrides: Partial<ActivityLogRow> = {}): ActivityLogRow {
  return {
    subject: 'transaction',
    action: 'update',
    actor_id: 'user-marie',
    actor_name: 'Marie',
    old_values: operation,
    new_values: { ...operation, amount: 150 },
    changed_fields: ['amount'],
    ...overrides,
  };
}

describe('formatActivity — opérations', () => {
  it('décrit un changement de montant', () => {
    expect(formatActivity(entry(), null, categories)).toBe(
      'Marie a modifié Restaurants : 15,00 € → 150,00 €'
    );
  });

  it('nomme par la catégorie d’avant, suivie de la note, et liste plusieurs champs', () => {
    const before = { ...operation, note: 'Pizzeria' };
    const result = formatActivity(
      entry({
        old_values: before,
        new_values: { ...before, category_id: 'cat-alim', occurred_on: '2026-09-09' },
        changed_fields: ['category_id', 'occurred_on'],
      }),
      null,
      categories
    );

    expect(result).toBe(
      'Marie a modifié Restaurants · Pizzeria : catégorie → Alimentation, date 8 sept. → 9 sept.'
    );
  });

  it('décrit un changement de type et de note', () => {
    const result = formatActivity(
      entry({
        new_values: { ...operation, type: 'income', note: 'Remboursement' },
        changed_fields: ['note', 'type'],
      }),
      null,
      categories
    );

    expect(result).toBe(
      'Marie a modifié Restaurants : type Dépense → Revenu, note aucune → « Remboursement »'
    );
  });

  it('décrit une suppression avec montant et date', () => {
    const result = formatActivity(
      entry({
        action: 'delete',
        old_values: { ...operation, category_id: 'cat-alim', amount: 54, note: 'Carrefour' },
        new_values: null,
        changed_fields: [],
      }),
      null,
      categories
    );

    expect(result).toBe('Marie a supprimé Alimentation · Carrefour, 54,00 € du 8 sept.');
  });

  it('dit « Vous » quand l’auteur est l’utilisateur courant', () => {
    expect(formatActivity(entry(), 'user-marie', categories)).toBe(
      'Vous avez modifié Restaurants : 15,00 € → 150,00 €'
    );
  });

  it('garde le nom d’un auteur dont le compte a disparu', () => {
    expect(formatActivity(entry({ actor_id: null }), 'user-marie', categories)).toBe(
      'Marie a modifié Restaurants : 15,00 € → 150,00 €'
    );
  });

  it('signale une action faite hors de l’app', () => {
    expect(formatActivity(entry({ actor_id: null, actor_name: null }), null, categories)).toBe(
      "Hors de l'app a modifié Restaurants : 15,00 € → 150,00 €"
    );
  });

  it('remplace une catégorie supprimée depuis', () => {
    const before = { ...operation, category_id: 'cat-disparue' };
    const result = formatActivity(
      entry({ old_values: before, new_values: { ...before, amount: 150 } }),
      null,
      categories
    );

    expect(result).toBe('Marie a modifié catégorie supprimée : 15,00 € → 150,00 €');
  });

  it('nomme « Sans catégorie » une opération sans catégorie', () => {
    const before = { ...operation, category_id: null };
    const result = formatActivity(
      entry({ old_values: before, new_values: { ...before, amount: 150 } }),
      null,
      categories
    );

    expect(result).toBe('Marie a modifié Sans catégorie : 15,00 € → 150,00 €');
  });

  it('garde l’entrée sans détail quand aucun champ n’est affichable', () => {
    const result = formatActivity(
      entry({ changed_fields: ['savings_goal_id'] }),
      null,
      categories
    );

    expect(result).toBe('Marie a modifié Restaurants');
  });
});

describe('formatActivity — budgets', () => {
  const budget = { category_id: 'cat-resto', amount: 200 };

  it('décrit un changement de plafond', () => {
    const result = formatActivity(
      entry({
        subject: 'budget',
        old_values: budget,
        new_values: { ...budget, amount: 300 },
        changed_fields: ['amount'],
      }),
      null,
      categories
    );

    expect(result).toBe('Marie a modifié le plafond Restaurants : 200,00 € → 300,00 €');
  });

  it('décrit une suppression de budget', () => {
    const result = formatActivity(
      entry({ subject: 'budget', action: 'delete', old_values: budget, new_values: null, changed_fields: [] }),
      null,
      categories
    );

    expect(result).toBe('Marie a supprimé le budget Restaurants (200,00 €)');
  });

  it('garde l’entrée sans détail quand aucun champ n’est affichable', () => {
    const result = formatActivity(
      entry({
        subject: 'budget',
        old_values: budget,
        new_values: { ...budget, period: 'weekly' },
        changed_fields: ['period'],
      }),
      null,
      categories
    );

    expect(result).toBe('Marie a modifié le budget Restaurants');
  });
});

describe('formatActivity — valeurs malformées', () => {
  it('ne plante pas sur des old_values qui ne sont pas un objet', () => {
    const result = formatActivity(
      entry({ old_values: 'oops', new_values: [1, 2] }),
      null,
      categories
    );

    expect(result).toBe('Marie a modifié Sans catégorie');
  });

  it('omet un montant qui n’est pas un nombre', () => {
    const result = formatActivity(
      entry({ old_values: { ...operation, amount: '15' } }),
      null,
      categories
    );

    expect(result).toBe('Marie a modifié Restaurants');
  });
});

describe('formatActivityTime', () => {
  // Construits en heure locale puis passés par toISOString() : le test ne
  // dépend pas du fuseau de la machine.
  const now = new Date(2026, 8, 10, 18, 0);

  it('dit « Aujourd’hui » pour le jour même', () => {
    expect(formatActivityTime(new Date(2026, 8, 10, 14, 32).toISOString(), now)).toBe(
      "Aujourd'hui, 14:32"
    );
  });

  it('dit « Hier » pour la veille', () => {
    expect(formatActivityTime(new Date(2026, 8, 9, 9, 5).toISOString(), now)).toBe('Hier, 09:05');
  });

  it('donne jour et mois dans l’année en cours', () => {
    expect(formatActivityTime(new Date(2026, 8, 8, 9, 5).toISOString(), now)).toBe(
      '8 sept., 09:05'
    );
  });

  it('ajoute l’année pour une année passée', () => {
    expect(formatActivityTime(new Date(2025, 8, 8, 9, 5).toISOString(), now)).toBe(
      '8 sept. 2025, 09:05'
    );
  });

  it('accepte les six décimales que rend Postgres', () => {
    const iso = new Date(2026, 8, 10, 14, 32).toISOString().replace('.000Z', '.123456+00:00');

    expect(formatActivityTime(iso, now)).toBe("Aujourd'hui, 14:32");
  });
});

describe('wasEdited', () => {
  it('est faux quand updated_at vaut created_at', () => {
    expect(
      wasEdited({
        created_at: '2026-09-10T14:32:05.123456+00:00',
        updated_at: '2026-09-10T14:32:05.123456+00:00',
      })
    ).toBe(false);
  });

  it('est vrai quand updated_at est postérieur', () => {
    expect(
      wasEdited({
        created_at: '2026-09-10T14:32:05+00:00',
        updated_at: '2026-09-10T16:00:00.5+00:00',
      })
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer les tests et constater l'échec**

Run: `npx jest src/lib/activity-format.test.ts`
Expected: FAIL, `Cannot find module '@/lib/activity-format'`.

- [ ] **Step 3: Écrire le module**

Créer `src/lib/activity-format.ts` :

```ts
import { dateToIso, isoToDate } from '@/lib/dates';
import { formatAmount } from '@/lib/money';
import type { Json } from '@/types/database';

/**
 * Phrases du journal d'activité.
 *
 * Module pur, sans dépendance au framework, couvert par Jest comme `money` et
 * `dates`. `ActivityLogRow` est structurel plutôt qu'importé des types
 * générés : `Tables<'activity_log'>` lui est assignable, et le module ne
 * dépend pas de leur régénération.
 */
export type ActivityLogRow = {
  subject: 'transaction' | 'budget';
  action: 'update' | 'delete';
  actor_id: string | null;
  actor_name: string | null;
  old_values: Json;
  new_values: Json | null;
  changed_fields: string[];
};

export type CategoryName = { id: string; name: string };

type JsonObject = { [key: string]: Json | undefined };

const UNKNOWN_ACTOR = "Hors de l'app";
const NO_CATEGORY = 'Sans catégorie';
const DELETED_CATEGORY = 'catégorie supprimée';

// Hissés au niveau du module, comme dans dates.ts : construire un
// Intl.DateTimeFormat coûte cher, et leur config ne dépend d'aucun argument.
const dayFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const dayWithYearFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * `old_values` et `new_values` arrivent typés `Json` : une chaîne, un tableau
 * ou `null` y sont possibles en principe. Tout ce qui n'est pas un objet est
 * lu comme un objet vide — la phrase perd ses détails, le fil ne plante pas.
 */
function asObject(value: Json | null): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

function readString(values: JsonObject, key: string): string | null {
  const value = values[key];
  return typeof value === 'string' ? value : null;
}

function readNumber(values: JsonObject, key: string): number | null {
  const value = values[key];
  return typeof value === 'number' ? value : null;
}

/** « 8 sept. » pour une date `YYYY-MM-DD`, `null` pour toute autre valeur. */
function formatDay(iso: string | null): string | null {
  if (iso === null || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }
  return dayFormatter.format(isoToDate(iso));
}

/**
 * Postgres rend de zéro à six décimales de seconde, zéros de fin retirés
 * (« 16:00:00.5 »). Le format ISO d'ECMAScript en attend exactement trois, et
 * Hermes est plus strict que V8 : on ramène toute fraction à trois chiffres —
 * tronquée ou complétée — avant de lire.
 */
function parseTimestamp(value: string): number {
  return Date.parse(
    value.replace(/\.(\d+)/, (_match, digits: string) => `.${digits.slice(0, 3).padEnd(3, '0')}`)
  );
}

function typeLabel(value: string | null): string | null {
  if (value === 'expense') {
    return 'Dépense';
  }
  if (value === 'income') {
    return 'Revenu';
  }
  return null;
}

function quoteNote(note: string | null): string {
  return note ? `« ${note} »` : 'aucune';
}

function categoryLabel(categoryId: string | null, categories: readonly CategoryName[]): string {
  if (categoryId === null) {
    return NO_CATEGORY;
  }
  return categories.find((category) => category.id === categoryId)?.name ?? DELETED_CATEGORY;
}

function actorAndVerb(entry: ActivityLogRow, currentUserId: string | null): string {
  const verb = entry.action === 'update' ? 'modifié' : 'supprimé';
  if (entry.actor_id !== null && entry.actor_id === currentUserId) {
    return `Vous avez ${verb}`;
  }
  return `${entry.actor_name ?? UNKNOWN_ACTOR} a ${verb}`;
}

function amountChange(before: JsonObject, after: JsonObject): string | null {
  const from = readNumber(before, 'amount');
  const to = readNumber(after, 'amount');
  return from === null || to === null ? null : `${formatAmount(from)} € → ${formatAmount(to)} €`;
}

/**
 * Nom d'une opération : le même que dans la liste, sa catégorie — celle
 * d'avant le changement, puisque c'est sous ce nom que les membres la
 * connaissaient —, suivie de la note comme sur la ligne d'information de
 * TransactionRow.
 */
function transactionLabel(before: JsonObject, categories: readonly CategoryName[]): string {
  const name = categoryLabel(readString(before, 'category_id'), categories);
  const note = readString(before, 'note');
  return note ? `${name} · ${note}` : name;
}

/**
 * Détail d'une modification d'opération, dans un ordre fixe. Un champ absent
 * de cette liste est ignoré à l'affichage ; une valeur malformée fait tomber
 * sa seule partie, pas la phrase. Quand la catégorie change, seule la
 * nouvelle est donnée : l'ancienne est déjà dans le nom.
 */
function transactionChanges(
  entry: ActivityLogRow,
  before: JsonObject,
  after: JsonObject,
  categories: readonly CategoryName[]
): string[] {
  const fields = entry.changed_fields;
  const parts: string[] = [];

  if (fields.includes('amount')) {
    const change = amountChange(before, after);
    if (change !== null) {
      parts.push(change);
    }
  }
  if (fields.includes('category_id')) {
    parts.push(`catégorie → ${categoryLabel(readString(after, 'category_id'), categories)}`);
  }
  if (fields.includes('occurred_on')) {
    const from = formatDay(readString(before, 'occurred_on'));
    const to = formatDay(readString(after, 'occurred_on'));
    if (from !== null && to !== null) {
      parts.push(`date ${from} → ${to}`);
    }
  }
  if (fields.includes('type')) {
    const from = typeLabel(readString(before, 'type'));
    const to = typeLabel(readString(after, 'type'));
    if (from !== null && to !== null) {
      parts.push(`type ${from} → ${to}`);
    }
  }
  if (fields.includes('note')) {
    parts.push(`note ${quoteNote(readString(before, 'note'))} → ${quoteNote(readString(after, 'note'))}`);
  }

  return parts;
}

/**
 * Une phrase par entrée. Une entrée sans détail affichable garde sa phrase
 * courte (« Marie a modifié Restaurants ») : un journal de confiance ne cache
 * pas d'entrée.
 */
export function formatActivity(
  entry: ActivityLogRow,
  currentUserId: string | null,
  categories: readonly CategoryName[]
): string {
  const actor = actorAndVerb(entry, currentUserId);
  const before = asObject(entry.old_values);
  const after = asObject(entry.new_values);

  if (entry.subject === 'budget') {
    const name = categoryLabel(readString(before, 'category_id'), categories);

    if (entry.action === 'delete') {
      const amount = readNumber(before, 'amount');
      return amount === null
        ? `${actor} le budget ${name}`
        : `${actor} le budget ${name} (${formatAmount(amount)} €)`;
    }

    const change = entry.changed_fields.includes('amount') ? amountChange(before, after) : null;
    return change === null ? `${actor} le budget ${name}` : `${actor} le plafond ${name} : ${change}`;
  }

  const label = transactionLabel(before, categories);

  if (entry.action === 'delete') {
    const amount = readNumber(before, 'amount');
    const day = formatDay(readString(before, 'occurred_on'));
    const tail = amount !== null && day !== null ? `, ${formatAmount(amount)} € du ${day}` : '';
    return `${actor} ${label}${tail}`;
  }

  const parts = transactionChanges(entry, before, after, categories);
  return parts.length === 0 ? `${actor} ${label}` : `${actor} ${label} : ${parts.join(', ')}`;
}

/** « Aujourd'hui, 14:32 », « Hier, 09:05 », « 8 sept., 09:05 », « 8 sept. 2025, 09:05 ». */
export function formatActivityTime(occurredAt: string, now: Date = new Date()): string {
  const date = new Date(parseTimestamp(occurredAt));
  const time = timeFormatter.format(date);
  const day = dateToIso(date);

  if (day === dateToIso(now)) {
    return `Aujourd'hui, ${time}`;
  }

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day === dateToIso(yesterday)) {
    return `Hier, ${time}`;
  }

  const formatter = date.getFullYear() === now.getFullYear() ? dayFormatter : dayWithYearFormatter;
  return `${formatter.format(date)}, ${time}`;
}

/**
 * Vrai si la ligne a été réellement modifiée depuis sa saisie.
 *
 * Fiable grâce à la base : touch_updated_at() ne bouge plus sur un
 * enregistrement sans changement, et la migration du journal a remis
 * updated_at à created_at sur toutes les lignes existantes. Les deux valeurs
 * sont comparées comme des instants.
 */
export function wasEdited(row: { created_at: string; updated_at: string }): boolean {
  return parseTimestamp(row.updated_at) > parseTimestamp(row.created_at);
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx jest src/lib/activity-format.test.ts`
Expected: PASS, 22 tests.

Si une assertion échoue sur une espace entre deux caractères qui semblent identiques, c'est un séparateur de milliers ou une espace insécable produit par `Intl` : les fixtures restent sous 1 000 € précisément pour l'éviter. Corriger la fixture, pas le module.

Run: `npm test`
Expected: toute la suite passe (56 tests existants + 22).

- [ ] **Step 5: Vérifier le typage et le lint**

Run: `npx tsc --noEmit` puis `npm run lint`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add src/lib/activity-format.ts src/lib/activity-format.test.ts
git commit -m "feat: phrases du journal d'activite et mention modifie"
```

---

## Task 4: Déploiement de la migration et régénération des types

> **Réservée au contrôleur — ne pas confier à un sous-agent.** Cette tâche écrit sur la base de production du projet lié, de façon irréversible, et **exige l'accord explicite de l'utilisateur** avant le `db push`.

**Files:**
- Modify: `src/types/database.ts` (régénéré)

**Interfaces:**
- Consumes: la migration complète des tâches 1 et 2, verte en local.
- Produces: `Tables<'activity_log'>`, `Enums<'activity_subject'>`, `Enums<'activity_action'>` dans `src/types/database.ts`, plus les alias `ActivitySubject` et `ActivityAction`.

- [ ] **Step 1: Vérifier l'état des migrations**

Run: `npx supabase migration list --linked`
Expected: toutes les migrations présentes des deux côtés, sauf `20260910000100`, présente en local seulement. Si une autre migration apparaît en attente, s'arrêter et le signaler.

- [ ] **Step 2: Obtenir l'accord explicite de l'utilisateur**

Lui écrire, en substance :

> La migration `20260910000100_activity_log.sql` va être appliquée à la base de production. Elle **remet la date de modification de toutes tes opérations et de tous tes budgets à leur date de création** : les dates de modification actuelles sont perdues. Cette opération est irréversible. Le journal et la mention « modifié » démarreront à partir de maintenant. Je pousse ?

Ne rien pousser sans un « oui » explicite.

- [ ] **Step 3: Pousser la migration**

Run: `npx supabase db push`
Expected: `Applying migration 20260910000100_activity_log.sql...` puis `Finished supabase db push.`

- [ ] **Step 4: Régénérer les types**

Lancer dans le shell **Bash** (Git Bash), pas PowerShell : sous Windows PowerShell 5.1, la redirection `>` réencode la sortie.

Run: `npx supabase gen types typescript --linked > src/types/database.ts`

- [ ] **Step 5: Remettre l'en-tête et les alias**

Remettre en tête de `src/types/database.ts`, à l'identique :

```ts
/**
 * Types de la base Supabase — GÉNÉRÉS, ne pas éditer à la main.
 *
 * Régénérer après toute migration :
 *
 *   npx supabase gen types typescript --linked > src/types/database.ts
 *
 * puis remettre cet en-tête et les alias d'enums en fin de fichier.
 *
 * Toujours régénérer depuis --linked, jamais depuis --local : la pile locale
 * tourne une autre version de PostgREST et omet le bloc __InternalSupabase.
 * Si la migration n'est pas encore poussée, la pousser d'abord.
 */

```

Et en fin de fichier :

```ts

// Alias lisibles pour les enums du schéma, utilisés dans le code applicatif.
export type MembershipRole = Enums<'membership_role'>;
export type TransactionType = Enums<'transaction_type'>;
export type BudgetPeriod = Enums<'budget_period'>;
export type ActivitySubject = Enums<'activity_subject'>;
export type ActivityAction = Enums<'activity_action'>;
```

- [ ] **Step 6: Vérifier le diff**

Run: `git diff --stat src/types/database.ts` puis `git diff src/types/database.ts`
Expected: seulement des ajouts : la table `activity_log`, les deux enums (dans `Enums` et dans `Constants`), et les deux alias. `__InternalSupabase` toujours présent. Aucune autre table modifiée.

- [ ] **Step 7: Vérifier le typage, le lint et les tests**

Run: `npx tsc --noEmit`, puis `npm run lint`, puis `npm test`
Expected: tout propre.

- [ ] **Step 8: Commit**

```bash
git add src/types/database.ts
git commit -m "chore: regenere les types apres la migration du journal d'activite"
```

---

## Task 5: Couche données et hook du journal

**Files:**
- Create: `src/data/activity.ts`
- Create: `src/hooks/use-activity.ts`
- Modify: `src/lib/query-keys.ts`
- Modify: `src/hooks/use-categories.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `Tables<'activity_log'>` (tâche 4) ; `useActiveGroup()` qui rend `{ activeGroupId: string | null, isLoading, error, … }`.
- Produces:
  ```ts
  // src/data/activity.ts
  export type ActivityEntry = Tables<'activity_log'>;
  export type ActivityCursor = { occurredAt: string; id: string };
  export function listActivityPage(
    groupId: string,
    cursor: ActivityCursor | null,
    limit: number
  ): Promise<ActivityEntry[]>;

  // src/lib/query-keys.ts
  activity: (groupId: string) => readonly ['activity', string];

  // src/hooks/use-activity.ts
  export const ACTIVITY_PAGE_SIZE = 30;
  export function useActivity(): {
    entries: ActivityEntry[];
    isLoading: boolean;
    error: unknown;
    isEmptyError: boolean;
    isFetchingNextPage: boolean;
    loadMore: () => void;
    retry: () => void;
    refresh: () => Promise<void>;
  };

  // src/hooks/use-categories.ts — champ ajouté au retour
  retry: () => void;
  ```

- [ ] **Step 1: Écrire la couche données**

Créer `src/data/activity.ts` :

```ts
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type ActivityEntry = Tables<'activity_log'>;

/** Dernière entrée rendue par la page précédente. */
export type ActivityCursor = {
  /** Tel que PostgREST l'a rendu — jamais repassé par `Date`. */
  occurredAt: string;
  id: string;
};

/**
 * Une page du journal du groupe, les plus récentes d'abord.
 *
 * Même règle que listPage() de l'historique, pour la même raison : la
 * pagination porte sur le couple `(occurred_at, id)`, jamais sur un décalage.
 * Une entrée écrite pendant le défilement décalerait toutes les pages
 * suivantes d'un `OFFSET`.
 *
 * `occurredAt` garde les microsecondes que rend Postgres. Un aller-retour par
 * `Date` les tronquerait à la milliseconde, et la comparaison `lt` sauterait
 * ou répéterait une entrée.
 *
 * Les valeurs d'horodatage sont entre guillemets : `.`, `:` et `+` sont des
 * caractères réservés dans l'arbre `or` de PostgREST. Le client encode les
 * guillemets dans l'URL.
 */
export async function listActivityPage(
  groupId: string,
  cursor: ActivityCursor | null,
  limit: number
): Promise<ActivityEntry[]> {
  let query = supabase.from('activity_log').select('*').eq('group_id', groupId);

  if (cursor !== null) {
    // PostgREST n'exprime pas la comparaison de couples `(a, b) < (c, d)` :
    // ce `or` produit le même prédicat. Les deux valeurs viennent d'une ligne
    // déjà renvoyée par le serveur, jamais d'une saisie.
    query = query.or(
      `occurred_at.lt."${cursor.occurredAt}",` +
        `and(occurred_at.eq."${cursor.occurredAt}",id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data;
}
```

- [ ] **Step 2: Déclarer la clé de cache**

Dans `src/lib/query-keys.ts`, ajouter en fin d'objet, après `transactionHistory` :

```ts
  // Hors de ['transactions'] à dessein : le fil se consulte délibérément, se
  // recharge à chaque ouverture et au geste « tirer pour rafraîchir ». Aucune
  // invalidation n'a besoin de l'atteindre, et le nicher le ferait recharger
  // à chaque saisie pour rien.
  activity: (groupId: string) => ['activity', groupId] as const,
```

- [ ] **Step 3: Écrire le hook**

Créer `src/hooks/use-activity.ts` :

```ts
import { useInfiniteQuery } from '@tanstack/react-query';

import { listActivityPage, type ActivityCursor, type ActivityEntry } from '@/data/activity';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';

/** Entrées par page : une entrée tient sur deux ou trois lignes. */
export const ACTIVITY_PAGE_SIZE = 30;

/**
 * Journal du groupe actif.
 *
 * Pas de temps réel : une liste qui bouge sous le doigt pendant qu'on la lit
 * est pire qu'une liste rechargée à l'ouverture. `refetchOnMount: 'always'`
 * passe outre le `staleTime` global de 30 s, pour que chaque ouverture de
 * l'écran montre l'état du moment.
 */
export function useActivity(): {
  entries: ActivityEntry[];
  isLoading: boolean;
  error: unknown;
  /** Vrai quand l'échec porte sur la première page : rien n'est affichable. */
  isEmptyError: boolean;
  isFetchingNextPage: boolean;
  loadMore: () => void;
  retry: () => void;
  refresh: () => Promise<void>;
} {
  const { activeGroupId } = useActiveGroup();

  const query = useInfiniteQuery({
    queryKey: queryKeys.activity(activeGroupId ?? ''),
    queryFn: ({ pageParam }) =>
      listActivityPage(activeGroupId as string, pageParam, ACTIVITY_PAGE_SIZE),
    initialPageParam: null as ActivityCursor | null,
    getNextPageParam: (lastPage): ActivityCursor | null => {
      // Une page plus courte que demandée est forcément la dernière.
      if (lastPage.length < ACTIVITY_PAGE_SIZE) {
        return null;
      }
      const last = lastPage[lastPage.length - 1];
      return { occurredAt: last.occurred_at, id: last.id };
    },
    enabled: activeGroupId !== null,
    refetchOnMount: 'always',
  });

  return {
    entries: query.data?.pages.flat() ?? [],
    isLoading: query.isLoading,
    error: query.error,
    // Même raisonnement que use-transaction-history.ts : seul l'échec du
    // premier chargement vide l'écran.
    isEmptyError: query.isLoadingError,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    },
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}
```

- [ ] **Step 4: Exposer `retry` dans `useCategories`**

Dans `src/hooks/use-categories.ts`, remplacer la signature et le corps de `useCategories` :

```ts
export function useCategories(type: TransactionType | null): {
  categories: Category[];
  isLoading: boolean;
  error: unknown;
  retry: () => void;
} {
  const { activeGroupId } = useActiveGroup();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.categories(activeGroupId ?? ''),
    queryFn: () => listForGroup(activeGroupId as string),
    enabled: activeGroupId !== null,
  });

  const categories = useMemo(
    () => (data ?? []).filter((category) => type === null || category.type === type),
    [data, type]
  );

  return {
    categories,
    isLoading,
    error,
    retry: () => {
      void refetch();
    },
  };
}
```

Les appelants existants déstructurent un sous-ensemble du retour : un champ de plus ne les touche pas.

- [ ] **Step 5: Documenter dans `CLAUDE.md`**

À la fin de la section `## Activity log` ajoutée à la tâche 2, ajouter :

```markdown
On the app side, `queryKeys.activity(groupId)` sits outside `['transactions']` and has no Realtime subscription on purpose. The feed is read deliberately: it refetches on every open (`refetchOnMount: 'always'`) and on pull-to-refresh, because a list that shifts under the finger while being read is worse. Pages are cursor-paginated on `(occurred_at, id)` like the history. The cursor keeps the timestamp string exactly as PostgREST returned it: a round trip through `Date` drops the microseconds, and the next page would repeat or skip an entry.
```

- [ ] **Step 6: Vérifier le typage et le lint**

Run: `npx tsc --noEmit` puis `npm run lint`
Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add src/data/activity.ts src/hooks/use-activity.ts src/lib/query-keys.ts src/hooks/use-categories.ts CLAUDE.md
git commit -m "feat: lecture paginee du journal d'activite"
```

---

## Task 6: Écran « Activité » et point d'entrée

**Files:**
- Create: `src/app/(app)/activity.tsx`
- Modify: `src/app/(app)/_layout.tsx`
- Modify: `src/app/(app)/history.tsx`

**Interfaces:**
- Consumes: `useActivity()` et `useCategories(null)` (tâche 5) ; `formatActivity`, `formatActivityTime` (tâche 3) ; `useAuth()` qui rend `{ session: Session | null, … }` ; `useActiveGroup()`.
- Produces: la route `/activity`.

- [ ] **Step 1: Créer l'écran**

Créer `src/app/(app)/activity.tsx`. Il reprend la structure de `history.tsx` : `FlatList` hors de `Screen` pour garder la virtualisation, même en-tête, mêmes états.

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useActivity } from '@/hooks/use-activity';
import { useAuth } from '@/hooks/use-auth';
import { useCategories } from '@/hooks/use-categories';
import { formatActivity, formatActivityTime } from '@/lib/activity-format';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, radius, spacing, useColors } from '@/theme/tokens';

// Référence stable, comme dans history.tsx.
function ItemSeparator() {
  return <View style={styles.separator} />;
}

/**
 * Journal des modifications et suppressions du groupe actif.
 *
 * N'utilise pas `Screen`, pour la même raison que l'historique : une
 * `FlatList` dans un `ScrollView` perd sa virtualisation.
 */
export default function ActivityScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { isLoading: groupLoading, error: groupError } = useActiveGroup();

  // Toutes les catégories, dépense et revenu : une entrée peut viser l'une ou
  // l'autre. Tant qu'elles chargent, aucune phrase n'est rendue — sans elles,
  // chaque entrée afficherait « catégorie supprimée » un instant.
  const {
    categories,
    isLoading: categoriesLoading,
    error: categoriesError,
    retry: retryCategories,
  } = useCategories(null);

  const { entries, isLoading, error, isEmptyError, isFetchingNextPage, loadMore, retry, refresh } =
    useActivity();

  const [refreshing, setRefreshing] = useState(false);

  const currentUserId = session?.user.id ?? null;

  // Seul l'échec du premier chargement vide l'écran ; celui d'une page
  // suivante va en pied de liste.
  const blockingError: unknown = groupError || categoriesError || (isEmptyError ? error : null);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  function renderEmpty() {
    // La requête du journal est désactivée tant que le groupe actif n'est pas
    // résolu : son `isLoading` reste à `false` et afficherait l'état vide.
    if (isLoading || groupLoading) {
      return <ActivityIndicator color={colors.primary} style={styles.centered} />;
    }

    return (
      <Text style={[styles.empty, styles.centered, { color: colors.textMuted }]}>
        Aucune modification ni suppression pour l’instant.
      </Text>
    );
  }

  function renderFooter() {
    if (isFetchingNextPage) {
      return <ActivityIndicator color={colors.primary} style={styles.footer} />;
    }

    if (error !== null && !isEmptyError) {
      return (
        <View style={styles.footer}>
          <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
          <Button title="Réessayer" variant="ghost" onPress={retry} />
        </View>
      );
    }

    return null;
  }

  function renderBody() {
    if (blockingError) {
      return (
        <View style={styles.centered}>
          <Text style={[styles.error, { color: colors.danger }]}>
            {dataErrorMessage(blockingError)}
          </Text>
          <Button
            title="Réessayer"
            variant="ghost"
            onPress={() => {
              retry();
              retryCategories();
            }}
          />
        </View>
      );
    }

    if (categoriesLoading) {
      return <ActivityIndicator color={colors.primary} style={styles.centered} />;
    }

    return (
      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.id}
        renderItem={({ item }) => (
          <View
            style={[styles.entry, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.sentence, { color: colors.text }]}>
              {formatActivity(item, currentUserId, categories)}
            </Text>
            <Text style={[styles.time, { color: colors.textMuted }]}>
              {formatActivityTime(item.occurred_at)}
            </Text>
          </View>
        )}
        ListEmptyComponent={renderEmpty()}
        ListFooterComponent={renderFooter()}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={() => {
          void handleRefresh();
        }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        ItemSeparatorComponent={ItemSeparator}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={spacing.sm}
          onPress={() => router.back()}
        >
          <Text style={[styles.back, { color: colors.textMuted }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Activité</Text>
      </View>

      {renderBody()}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  back: {
    fontFamily: font.semibold,
    fontSize: 30,
    lineHeight: 34,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  content: {
    paddingHorizontal: spacing.lg,
    flexGrow: 1,
  },
  separator: {
    height: spacing.sm - 1,
  },
  entry: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  sentence: {
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  time: {
    fontFamily: font.regular,
    fontSize: 12,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  empty: {
    fontFamily: font.regular,
    fontSize: 14,
    textAlign: 'center',
  },
  error: {
    fontFamily: font.medium,
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
});
```

- [ ] **Step 2: Enregistrer la route**

Dans `src/app/(app)/_layout.tsx`, dans le `<Stack>`, juste après `<Stack.Screen name="history" />` :

```tsx
      <Stack.Screen name="activity" />
```

- [ ] **Step 3: Ajouter le lien « Activité » à l'en-tête de l'historique**

Dans `src/app/(app)/history.tsx`, remplacer la ligne du titre :

```tsx
        <Text style={[styles.title, { color: colors.text }]}>Opérations</Text>
```

par :

```tsx
        <Text style={[styles.title, { color: colors.text }]}>Opérations</Text>
        {/* C'est ici qu'on vient vérifier ses opérations ; le tableau de bord
            porte déjà assez d'éléments. */}
        <Link href="/activity" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Activité du groupe"
            hitSlop={spacing.sm}
            // Aplati : <Link asChild> transmet le style par un Slot, qui lève
            // une erreur de rendu en développement s'il reçoit un tableau.
            style={StyleSheet.flatten(styles.headerLink)}
          >
            <Text style={[styles.headerLinkLabel, { color: colors.primary }]}>Activité</Text>
          </Pressable>
        </Link>
```

Puis, dans le `StyleSheet.create` du même fichier, après le style `title` :

```ts
  headerLink: {
    // Pousse le lien au bord droit de l'en-tête.
    marginLeft: 'auto',
  },
  headerLinkLabel: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
```

`Link`, `Pressable` et `StyleSheet` sont déjà importés dans `history.tsx`.

- [ ] **Step 4: Vérifier le typage, le lint et le bundle**

Run: `npx tsc --noEmit` puis `npm run lint`
Expected: aucune erreur. `href="/activity"` ne type que parce que `activity.tsx` existe (`typedRoutes`) ; si `tsc` refuse la route, relancer une fois `npx expo start` pour régénérer les types de routes, puis l'arrêter.

Run: `npx expo export --platform android --output-dir <scratchpad>/export-activity`
Expected: export réussi. Rappel : ce bundle est de production, il ne prouve rien sur l'erreur `Slot` du mode développement — d'où le `StyleSheet.flatten` ci-dessus, à ne pas retirer.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/activity.tsx" "src/app/(app)/_layout.tsx" "src/app/(app)/history.tsx"
git commit -m "feat: ecran Activite ouvert depuis l'historique"
```

---

## Task 7: Mention « modifié » sur les lignes

**Files:**
- Modify: `src/components/transaction/transaction-row.tsx`
- Modify: `src/components/budget/budget-row.tsx`

**Interfaces:**
- Consumes: `wasEdited(row: { created_at: string; updated_at: string }): boolean` (tâche 3). `TransactionWithCategory` et `BudgetWithCategory` portent tous deux `created_at` et `updated_at`.
- Produces: rien de nouveau pour les autres tâches.

- [ ] **Step 1: `TransactionRow`**

Dans `src/components/transaction/transaction-row.tsx`, ajouter l'import :

```ts
import { wasEdited } from '@/lib/activity-format';
```

puis remplacer le bloc `meta` :

```ts
  // « Carrefour · aujourd'hui », ou la seule date quand il n'y a pas de note.
  // Sans la date, deux lignes de la même catégorie sont indiscernables.
  const meta = [transaction.note, formatOccurredOn(transaction.occurred_on)]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
```

par :

```ts
  // « Carrefour · aujourd'hui », ou la seule date quand il n'y a pas de note.
  // Sans la date, deux lignes de la même catégorie sont indiscernables.
  // « modifié » en fin de ligne : un mot, jamais une icône seule. Le détail
  // — qui, quoi, avant, après — est dans l'écran Activité.
  const meta = [
    transaction.note,
    formatOccurredOn(transaction.occurred_on),
    wasEdited(transaction) ? 'modifié' : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
```

- [ ] **Step 2: `BudgetRow`**

Dans `src/components/budget/budget-row.tsx`, ajouter l'import :

```ts
import { wasEdited } from '@/lib/activity-format';
```

Après la ligne `const stacked = fontScale >= stackAtFontScale;`, ajouter :

```ts
  const edited = wasEdited(item.budget);
```

Remplacer l'`accessibilityLabel` du `Pressable` :

```tsx
      accessibilityLabel={`${categoryName}, ${formatAmount(item.spent)} euros sur ${formatAmount(item.budget.amount)} euros, ${percent} %. ${statusText(item)}${edited ? '. Plafond modifié' : ''}`}
```

Et remplacer le texte d'état :

```tsx
      <Text style={[styles.status, { color: statusColor[item.status] }]}>
        {statusText(item)} · {percent} %
      </Text>
```

par :

```tsx
      <Text style={[styles.status, { color: statusColor[item.status] }]}>
        {statusText(item)} · {percent} %
        {/* En gris, pas dans la couleur du statut : c'est une information,
            pas une alerte. */}
        {edited ? <Text style={{ color: colors.textMuted }}> · modifié</Text> : null}
      </Text>
```

- [ ] **Step 3: Vérifier le typage, le lint et les tests**

Run: `npx tsc --noEmit`, puis `npm run lint`, puis `npm test`
Expected: tout propre.

- [ ] **Step 4: Commit**

```bash
git add src/components/transaction/transaction-row.tsx src/components/budget/budget-row.tsx
git commit -m "feat: mention modifie sur les operations et les budgets"
```

- [ ] **Step 5: Vérification manuelle sur appareil (par l'utilisateur)**

Aucun composant ni hook n'a de test automatisé dans ce projet. À vérifier avec `npx expo start --clear` sur téléphone, **en mode développement** (c'est le seul où l'erreur `Slot` se voit) :

1. Enregistrer une opération sans rien changer : pas de « modifié », et rien dans Activité.
2. Changer le montant d'une opération : « modifié » apparaît sur la ligne, et Activité affiche « Vous avez modifié … : ancien → nouveau ».
3. Changer catégorie et date d'une même opération : une seule entrée, les deux changements dans la phrase.
4. Supprimer une opération : l'entrée « Vous avez supprimé … » apparaît.
5. Changer un plafond de budget : « modifié » sur la ligne du budget, et l'entrée dans Activité.
6. Tirer pour rafraîchir sur Activité : l'indicateur apparaît puis disparaît.
7. Pagination : passer temporairement `ACTIVITY_PAGE_SIZE` à `2`, produire au moins cinq entrées, faire défiler. Aucune entrée ne doit être répétée ni manquer. Remettre ensuite `30`, sans commit de la valeur temporaire. C'est le seul contrôle du curseur avec horodatage entre guillemets : PostgREST n'a pas de double dans le projet.
8. Lien « Activité » dans l'en-tête de l'historique, puis bouton retour.
9. Opérations et budgets saisis avant la migration : aucun ne doit afficher « modifié ».
