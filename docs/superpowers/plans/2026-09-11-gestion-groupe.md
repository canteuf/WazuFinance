# Gestion du groupe (écran 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer l'écran 7 — créer un groupe partagé, rejoindre un groupe par code, voir ses membres et rôles, exclure un membre ou quitter un groupe, gérer l'invitation, et basculer le groupe actif depuis le tableau de bord.

**Architecture:** Une migration ajoute ce qui manque en base : la RPC `create_shared_group()` (contourne le problème d'œuf et de poule sur `account_memberships_insert_owner`), un défaut généré pour `group_invitations.code`, et le trigger `guard_owner_orphan()` qui bloque le départ volontaire d'un propriétaire tant que le groupe a d'autres membres. Le reste (RLS, `join_group_with_code()`) existe déjà depuis le 4 septembre. Ce plan ajoute ensuite la couche donnée, les hooks TanStack Query, et quatre écrans : liste des groupes (bascule + création + adhésion), détail d'un groupe partagé (membres, invitation, quitter), plus l'entrée du tableau de bord qui manquait.

**Tech Stack:** Expo SDK 57, expo-router v6 (formSheet), TypeScript strict, TanStack Query v5, Supabase (Postgres, RLS, Realtime déjà en place sur `account_memberships`), pgTAP, `expo-clipboard` (nouvelle dépendance).

**Spec:** [docs/superpowers/specs/2026-09-11-gestion-groupe-design.md](../specs/2026-09-11-gestion-groupe-design.md)

## Global Constraints

- TypeScript strict, aucun `any`.
- Chaînes visibles en français, avec tous leurs accents ; identifiants de code en anglais. Apostrophe typographique `’` (U+2019) dans tout texte JSX, jamais l'apostrophe droite (`react/no-unescaped-entities` échoue dessus). Dans le SQL, l'apostrophe reste échappée par doublement (`''`), comme dans les migrations existantes — ce n'est pas le même contexte.
- Noms de fichiers en kebab-case, composants en PascalCase.
- Un commit par tâche, message en français **sans accents**, comme le reste de l'historique. Aucun `git push` sans consigne explicite.
- `src/types/database.ts` est **généré** — ne jamais l'éditer à la main. La Task 1 ajoute la RPC `create_shared_group`, que `src/data/groups.ts` (Task 2) appelle via `supabase.rpc(...)` : ce client est typé par `Database['public']['Functions']`, donc `tsc` échoue tant que ce fichier n'est pas régénéré. Contrairement aux migrations précédentes de ce projet (qui n'ajoutaient aucune fonction appelée depuis le client), la régénération ne peut donc pas attendre la fusion — elle est la Task 1, Steps 6-9, et suppose d'avoir poussé la migration vers le projet lié au préalable (voir l'avertissement à cette étape).
- Vérification à chaque tâche touchant du code applicatif : `npx tsc --noEmit` et `npm run lint` propres.
- `npm run test:db` exige Docker Desktop démarré puis `npx supabase start`. Il réinitialise la base locale à partir de toutes les migrations avant de lancer `pg_prove` — pas besoin d'appeler `npx supabase db reset` séparément.
- Aucun composant ni hook n'a de test JS dans ce projet : seuls `src/lib/*.ts` sont couverts par Jest. Ce plan n'ajoute aucun module `src/lib/` pur — la génération du code et les gardes vivent en base, déjà couvertes par pgTAP. Les écrans/composants se vérifient par tsc + lint + relecture manuelle finale.
- Un écran n'importe jamais `supabase` directement ; il passe par `src/data/` via un hook.
- `<Link asChild>` : le style de l'enfant passe toujours par `StyleSheet.flatten(...)`, jamais un tableau.
- Sécurité en base (RLS), jamais un filtre côté client qui la doublerait.
- Une fonction `src/data/*.ts` qui écrit une ligne dont une policy vérifie l'auteur (`user_id`, `created_by`) reçoit cet identifiant en paramètre explicite depuis l'appelant (`session.user.id` via `useAuth()`) — jamais récupéré en interne via `supabase.auth.getUser()`. Voir `createSavingsGoal`/`createTransaction` pour le précédent déjà en place.

---

### Task 1: Migration `group_management` et son test pgTAP

**Files:**
- Create: `supabase/migrations/20260911000100_group_management.sql`
- Create: `supabase/tests/group_management_rls_test.sql`

**Interfaces:**
- Consomme : `budget_groups`, `account_memberships`, `group_invitations` et leurs policies existantes (`20260904000200_policies.sql`), `pgcrypto` (déjà activée).
- Produit : la RPC `public.create_shared_group(name text) returns uuid`, le défaut `group_invitations.code`, le trigger `account_memberships_guard_owner_orphan`. Consommés par la Task 2 (`src/data/groups.ts`).

Contrairement au test de la Task 1 du plan des objectifs d'épargne, rien de tout ceci n'existe encore : le test est écrit avant la migration et doit d'abord échouer (RED), comme un cycle TDD classique.

- [ ] **Step 1: Écrire le fichier de test, qui échoue tant que la migration n'existe pas**

```sql
-- RPC create_shared_group, garde anti-orphelin guard_owner_orphan, défaut du
-- code d'invitation (migration group_management). Voir
-- docs/superpowers/specs/2026-09-11-gestion-groupe-design.md.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(15);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000g1', 'alice-g@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000g2', 'bob-g@example.com',   '{"display_name": "Bob"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000g3', 'carol-g@example.com', '{"display_name": "Carol"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000g4', 'dora-g@example.com',  '{"display_name": "Dora"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000g5', 'eve-g@example.com',   '{"display_name": "Eve"}'::jsonb);

-- Coloc : Alice propriétaire, Bob et Carol membres. Sert au test de la garde
-- anti-orphelin.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000g6', 'Coloc', '00000000-0000-0000-0000-0000000000g1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000g6', '00000000-0000-0000-0000-0000000000g1', 'owner'),
  ('00000000-0000-0000-0000-0000000000g6', '00000000-0000-0000-0000-0000000000g2', 'member'),
  ('00000000-0000-0000-0000-0000000000g6', '00000000-0000-0000-0000-0000000000g3', 'member');

-- Test retrait : Alice propriétaire, Bob et Carol membres. Sert au test de
-- account_memberships_delete_owner_or_self entre deux membres simples.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000g9', 'Test retrait', '00000000-0000-0000-0000-0000000000g1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000g9', '00000000-0000-0000-0000-0000000000g1', 'owner'),
  ('00000000-0000-0000-0000-0000000000g9', '00000000-0000-0000-0000-0000000000g2', 'member'),
  ('00000000-0000-0000-0000-0000000000g9', '00000000-0000-0000-0000-0000000000g3', 'member');

-- Cascade : Dora propriétaire, Eve membre. Sert au test de suppression de
-- compte en cascade, qui doit passer malgré la garde.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000g7', 'Cascade', '00000000-0000-0000-0000-0000000000g4', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000g7', '00000000-0000-0000-0000-0000000000g4', 'owner'),
  ('00000000-0000-0000-0000-0000000000g7', '00000000-0000-0000-0000-0000000000g5', 'member');

-- ---------------------------------------------------------------------------
-- create_shared_group()
-- ---------------------------------------------------------------------------

set local role anon;
SELECT throws_ok(
  $$select public.create_shared_group('Sans session')$$,
  '42501',
  NULL,
  'anon ne peut pas executer create_shared_group'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000g1","role":"authenticated"}', true);

create temporary table g_new_group as
select public.create_shared_group('Vacances entre amis') as id;

SELECT is(
  (select owner_id from public.budget_groups where id = (select id from g_new_group)),
  '00000000-0000-0000-0000-0000000000g1'::uuid,
  'create_shared_group crée un groupe dont Alice est propriétaire'
);

SELECT is(
  (select role::text from public.account_memberships
    where group_id = (select id from g_new_group)
      and user_id = '00000000-0000-0000-0000-0000000000g1'),
  'owner',
  'create_shared_group crée la ligne d''adhésion owner'
);

-- ---------------------------------------------------------------------------
-- guard_owner_orphan : Alice, propriétaire de Coloc, ne peut pas partir tant
-- que Bob et Carol y sont.
-- ---------------------------------------------------------------------------

SELECT throws_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000000g6'
       and user_id = '00000000-0000-0000-0000-0000000000g1'$$,
  'P0001',
  'Le propriétaire ne peut pas quitter un groupe qui a d''autres membres',
  'Alice ne peut pas quitter Coloc tant que Bob et Carol y sont'
);

SELECT lives_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000000g6'
       and user_id = '00000000-0000-0000-0000-0000000000g2'$$,
  'Alice exclut Bob de Coloc'
);

SELECT lives_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000000g6'
       and user_id = '00000000-0000-0000-0000-0000000000g3'$$,
  'Alice exclut Carol de Coloc'
);

-- Alice est maintenant seule dans Coloc : la garde ne s'applique plus.
SELECT lives_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000000g6'
       and user_id = '00000000-0000-0000-0000-0000000000g1'$$,
  'Alice peut quitter Coloc une fois seule membre restante'
);

-- ---------------------------------------------------------------------------
-- account_memberships_delete_owner_or_self : un membre simple ne peut retirer
-- que lui-même, jamais un autre membre.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000g2","role":"authenticated"}', true);

-- Un DELETE que la policy ne laisse pas voir ne lève pas d'erreur : il ne
-- touche simplement aucune ligne, même motif que savings_goals_rls_test.sql.
SELECT lives_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000000g9'
       and user_id = '00000000-0000-0000-0000-0000000000g3'$$,
  'Bob ne supprime aucune ligne en tentant de retirer Carol, sans erreur'
);

SELECT is(
  (select count(*)::int from public.account_memberships
    where group_id = '00000000-0000-0000-0000-0000000000g9'
      and user_id = '00000000-0000-0000-0000-0000000000g3'),
  1,
  'Carol est toujours membre de Test retrait'
);

SELECT lives_ok(
  $$delete from public.account_memberships
     where group_id = '00000000-0000-0000-0000-0000000000g9'
       and user_id = '00000000-0000-0000-0000-0000000000g2'$$,
  'Bob se retire lui-même de Test retrait'
);

-- ---------------------------------------------------------------------------
-- Défaut du code d'invitation, et group_invitations_insert_owner
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000g1","role":"authenticated"}', true);

SELECT ok(
  (select code ~ '^[0-9a-f]{8}$' from (
    insert into public.group_invitations (group_id, created_by, expires_at)
    values ('00000000-0000-0000-0000-0000000000g9',
            '00000000-0000-0000-0000-0000000000g1', now() + interval '7 days')
    returning code
  ) as inv),
  'Le code d''invitation généré par défaut est 8 caractères hexadécimaux'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000g3","role":"authenticated"}', true);

SELECT throws_ok(
  $$insert into public.group_invitations (group_id, created_by, expires_at)
    values ('00000000-0000-0000-0000-0000000000g9',
            '00000000-0000-0000-0000-0000000000g3', now() + interval '7 days')$$,
  '42501',
  NULL,
  'Carol, simple membre, ne peut pas créer d''invitation'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000g1","role":"authenticated"}', true);

SELECT throws_ok(
  $$insert into public.group_invitations (group_id, created_by, expires_at)
    values ('00000000-0000-0000-0000-0000000000g9',
            '00000000-0000-0000-0000-0000000000g1', now() - interval '1 day')$$,
  '42501',
  NULL,
  'Une invitation avec une échéance passée est refusée'
);

-- ---------------------------------------------------------------------------
-- La garde ne bloque pas une cascade : suppression du compte de Dora,
-- propriétaire de Cascade, alors qu'Eve y est encore membre.
-- ---------------------------------------------------------------------------

set local role postgres;

SELECT lives_ok(
  $$delete from auth.users where id = '00000000-0000-0000-0000-0000000000g4'$$,
  'La suppression du compte de Dora réussit malgré Eve, encore membre'
);

SELECT is(
  (select count(*)::int from public.account_memberships
    where group_id = '00000000-0000-0000-0000-0000000000g7'),
  0,
  'La cascade a bien retiré Dora et Eve de Cascade'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `npm run test:db`
Expected: FAIL — `group_management_rls_test.sql` échoue (`function public.create_shared_group(text) does not exist` ou équivalent), les autres fichiers restent verts.

- [ ] **Step 3: Écrire la migration**

```sql
-- Écran 7 (gestion du groupe) : créer un groupe partagé sans policy
-- impossible à satisfaire, générer un code d'invitation en base, empêcher un
-- propriétaire de laisser un groupe orphelin de propriétaire.
--
-- Voir docs/superpowers/specs/2026-09-11-gestion-groupe-design.md.

-- ---------------------------------------------------------------------------
-- create_shared_group : contourne le problème d'œuf et de poule.
--
-- account_memberships_insert_owner exige is_group_owner(group_id), qui ne
-- peut jamais être vrai pour la toute première ligne d'un groupe (aucune
-- ligne owner n'existe encore). budget_groups_insert_shared suffit à créer
-- le groupe, mais pas la ligne d'adhésion qui suit.
-- ---------------------------------------------------------------------------

create function public.create_shared_group(name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  insert into public.budget_groups (name, owner_id, is_personal)
  values (name, auth.uid(), false)
  returning id into new_group_id;

  insert into public.account_memberships (group_id, user_id, role)
  values (new_group_id, auth.uid(), 'owner');

  return new_group_id;
end;
$$;

revoke all on function public.create_shared_group(text) from public, anon;
grant execute on function public.create_shared_group(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Code d'invitation généré en base : le client ne doit jamais en inventer un.
-- ---------------------------------------------------------------------------

alter table public.group_invitations
  alter column code set default encode(gen_random_bytes(4), 'hex');

-- ---------------------------------------------------------------------------
-- guard_owner_orphan : bloque le départ ou la rétrogradation volontaire d'un
-- propriétaire tant que le groupe compte d'autres membres.
--
-- pg_trigger_depth() = 1 restreint la garde à l'action directe : toute
-- cascade (suppression du groupe par son propriétaire, ou suppression de
-- compte) s'exécute imbriquée dans le trigger système de la contrainte, donc
-- à une profondeur supérieure à 1, et n'est pas concernée. Fermer cette
-- échappatoire côté suppression de compte est hors périmètre ici (écran 8,
-- pas encore conçu) : voir la spec.
-- ---------------------------------------------------------------------------

create function public.guard_owner_orphan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  becomes_non_owner boolean;
begin
  becomes_non_owner := (tg_op = 'DELETE') or (new.role <> 'owner');

  if pg_trigger_depth() = 1 and old.role = 'owner' and becomes_non_owner then
    if exists (
      select 1 from public.account_memberships
       where group_id = old.group_id and user_id <> old.user_id
    ) then
      raise exception 'Le propriétaire ne peut pas quitter un groupe qui a d''autres membres';
    end if;
  end if;

  -- BEFORE UPDATE doit renvoyer new : renvoyer old annulerait silencieusement
  -- toute modification autorisée en réécrivant les anciennes valeurs. old ne
  -- convient que pour delete, qui n'a pas de new.
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger account_memberships_guard_owner_orphan
  before update or delete on public.account_memberships
  for each row execute function public.guard_owner_orphan();
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `npm run test:db`
Expected: `group_management_rls_test.sql` passe ses 15 assertions, tous les autres fichiers restent verts (100/100 avant cette tâche, donc 115/115 après — ajuster le compte attendu si un autre fichier a changé depuis).

Si Docker ou le stack local ne démarrent pas : s'arrêter et le signaler, ne jamais sauter ce test.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260911000100_group_management.sql supabase/tests/group_management_rls_test.sql
git commit -m "feat(db): create_shared_group, code d invitation genere, garde anti-orphelin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Pousser la migration vers le projet lié, puis régénérer les types**

`supabase.rpc()` est typé par `Database['public']['Functions']`, généré dans `src/types/database.ts` : `create_shared_group` n'y figure pas encore, donc `supabase.rpc('create_shared_group', …)` (Task 2) échouerait `tsc --noEmit` tant que ce fichier n'est pas régénéré. Le fichier lui-même l'interdit depuis `--local` (« la pile locale tourne une autre version de PostgREST et omet le bloc `__InternalSupabase` ») : la seule voie correcte, déjà documentée dans son en-tête, est de pousser la migration vers le projet lié d'abord.

**⚠ Ceci modifie le projet Supabase de production (`ozwltxywsqvgmefuqvfv`) avant la fusion de cette branche sur `main`**, plus tôt dans le cycle que pour les fonctionnalités précédentes de ce projet. Le changement est strictement additif (une fonction, un défaut de colonne, un trigger — rien n'appelle encore `create_shared_group` côté production tant que ce plan n'est pas fusionné) mais reste une action sur un système partagé : **demander confirmation explicite à l'utilisateur avant d'exécuter `npx supabase db push`**, ne pas l'exécuter d'initiative même si le reste de la tâche est mécanique.

Une fois confirmé :

Run: `npx supabase db push`
Expected: applique `20260911000100_group_management.sql` sur le projet lié (déjà appliquée en local par la Task 1).

Run: `npx supabase gen types typescript --linked > src/types/database.ts`
Expected: régénère le fichier en écrasant l'en-tête et les alias d'enums de fin de fichier.

- [ ] **Step 7: Restaurer l'en-tête et les alias d'enums**

En haut du fichier, remettre :

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

En fin de fichier, après le bloc `export const Constants = { … } as const`, remettre :

```ts
// Alias lisibles pour les enums du schéma, utilisés dans le code applicatif.
export type MembershipRole = Enums<'membership_role'>;
export type TransactionType = Enums<'transaction_type'>;
export type BudgetPeriod = Enums<'budget_period'>;
export type ActivitySubject = Enums<'activity_subject'>;
export type ActivityAction = Enums<'activity_action'>;
```

- [ ] **Step 8: Vérifier**

Run: `npx tsc --noEmit && npm run lint`
Expected: propre. `Database['public']['Functions']` contient désormais `create_shared_group: { Args: { name: string }; Returns: string }`.

- [ ] **Step 9: Commit**

```bash
git add src/types/database.ts
git commit -m "chore: regenere les types apres la migration group_management

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Couche donnée — `src/data/groups.ts`

**Files:**
- Modify: `src/data/groups.ts`

**Interfaces:**
- Consomme : `supabase` (`@/lib/supabase`), `MembershipRole` (`@/types/database`, déjà importé dans ce fichier).
- Produit : `GroupMember`, `GroupInvitation`, `listGroupMembers(groupId)`, `createSharedGroup(name)`, `joinGroupWithCode(code)`, `removeMember(groupId, userId)`, `getActiveInvitation(groupId)`, `createInvitation(groupId, createdBy)`, `revokeInvitation(id)`. `MembershipSummary`/`listMemberships` existants ne bougent pas. Consommés par la Task 3 (hooks).

Pas de `leaveGroup` séparé : quitter un groupe et exclure un membre sont la même opération vue du client — l'appelant passe son propre `userId` pour l'un, celui d'un autre membre pour l'autre. La policy `account_memberships_delete_owner_or_self` tranche déjà qui a le droit de faire quoi ; dupliquer la fonction n'ajouterait rien.

Pas de test dédié : ces fonctions ne sont que des appels PostgREST/RPC directs, dans le même style que `src/data/savings-goals.ts`, et la sécurité réelle est déjà prouvée par la Task 1.

- [ ] **Step 1: Ajouter les types et fonctions à la fin du fichier**

```ts
export type GroupMember = {
  userId: string;
  displayName: string;
  email: string;
  role: MembershipRole;
};

/**
 * Membres d'un groupe, avec leur rôle.
 *
 * Filtré par `group_id` : la policy `account_memberships_select_member` ne
 * restreint qu'aux groupes dont l'appelant est membre, elle ne réduit pas à
 * un seul groupe à la fois — le filtre explicite reste nécessaire ici.
 */
export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('account_memberships')
    .select('role, users(id, display_name, email)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data.flatMap((row) => {
    const user = row.users;
    if (!user) {
      return [];
    }
    return [
      {
        userId: user.id,
        displayName: user.display_name,
        email: user.email,
        role: row.role,
      },
    ];
  });
}

/**
 * Crée un groupe partagé et sa ligne d'adhésion `owner`, de façon atomique.
 *
 * Passe par la RPC `create_shared_group` plutôt qu'un double INSERT direct :
 * `account_memberships_insert_owner` exige déjà `is_group_owner(group_id)`,
 * qui ne peut jamais être vrai pour la toute première ligne d'un groupe.
 */
export async function createSharedGroup(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_shared_group', { name });

  if (error) {
    throw error;
  }

  return data;
}

/** Rejoint un groupe partagé par son code d'invitation. Voir join_group_with_code(). */
export async function joinGroupWithCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_group_with_code', { invitation_code: code });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Retire un membre d'un groupe — exclusion par le propriétaire, ou départ
 * volontaire quand `userId` est celui de l'appelant. Une seule fonction :
 * `account_memberships_delete_owner_or_self` décide déjà qui a le droit.
 *
 * `.select('id').single()` force une erreur si RLS ou la garde anti-orphelin
 * ont filtré/refusé la ligne visée, même précédent que `deleteSavingsGoal`.
 */
export async function removeMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('account_memberships')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .select('id')
    .single();

  if (error) {
    throw error;
  }
}

export type GroupInvitation = {
  id: string;
  code: string;
  expiresAt: string;
};

/** Invitation active d'un groupe : ni révoquée, ni utilisée, ni expirée. Au plus une à la fois. */
export async function getActiveInvitation(groupId: string): Promise<GroupInvitation | null> {
  const { data, error } = await supabase
    .from('group_invitations')
    .select('id, code, expires_at')
    .eq('group_id', groupId)
    .is('revoked_at', null)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? { id: data.id, code: data.code, expiresAt: data.expires_at } : null;
}

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Crée une invitation valide 7 jours. `code` n'est pas fourni : la base le
 * génère (défaut `encode(gen_random_bytes(4), 'hex')`), le client ne doit
 * jamais en inventer un.
 */
export async function createInvitation(
  groupId: string,
  createdBy: string
): Promise<GroupInvitation> {
  const { data, error } = await supabase
    .from('group_invitations')
    .insert({
      group_id: groupId,
      created_by: createdBy,
      expires_at: new Date(Date.now() + INVITATION_LIFETIME_MS).toISOString(),
    })
    .select('id, code, expires_at')
    .single();

  if (error) {
    throw error;
  }

  return { id: data.id, code: data.code, expiresAt: data.expires_at };
}

export async function revokeInvitation(id: string): Promise<void> {
  const { error } = await supabase
    .from('group_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .single();

  if (error) {
    throw error;
  }
}
```

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit && npm run lint`
Expected: propre.

- [ ] **Step 3: Commit**

```bash
git add src/data/groups.ts
git commit -m "feat: couche donnee des membres, invitations et groupes partages

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Clés de cache et hooks

**Files:**
- Modify: `src/lib/query-keys.ts`
- Create: `src/hooks/use-group-mutations.ts`
- Create: `src/hooks/use-group-members.ts`
- Create: `src/hooks/use-group-invitation.ts`

**Interfaces:**
- Consomme : `queryKeys` (à étendre), `src/data/groups.ts` (Task 2).
- Produit :
  - `queryKeys.groupMembers(groupId): ['groupMembers', groupId]`
  - `queryKeys.groupInvitation(groupId): ['groupInvitation', groupId]`
  - `useGroupMutations(): { createGroup, joinGroup, removeGroupMember, isCreating, isJoining, isRemoving }`
  - `useGroupMembers(groupId): { members: GroupMember[]; isLoading; error; isLoadingError }`
  - `useGroupInvitation(groupId): { invitation: GroupInvitation | null; isLoading; error; generate; regenerate; isGenerating }`

  Consommés par les Tasks 4 et 5 (écrans).

- [ ] **Step 1: Ajouter les clés de cache**

À la fin de l'objet `queryKeys` dans `src/lib/query-keys.ts`, après `savingsGoals` :

```ts
  // Un groupe à la fois, comme `activity` : rien de ce qui invalide
  // `['transactions']`/`['budgets']` ne concerne les membres ou les
  // invitations, pas de nichage sous ces préfixes.
  groupMembers: (groupId: string) => ['groupMembers', groupId] as const,
  groupInvitation: (groupId: string) => ['groupInvitation', groupId] as const,
```

- [ ] **Step 2: Écrire le hook de mutation**

`src/hooks/use-group-mutations.ts` :

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createSharedGroup, joinGroupWithCode, removeMember } from '@/data/groups';
import { queryKeys } from '@/lib/query-keys';

/**
 * Création, adhésion et retrait d'un groupe.
 *
 * Chaque mutation invalide `queryKeys.memberships()` : le groupe actif ou la
 * liste des groupes a pu changer (nouveau groupe créé, groupe rejoint,
 * membre — soi-même ou un autre — retiré).
 */
export function useGroupMutations() {
  const queryClient = useQueryClient();

  function invalidateMemberships() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.memberships() });
  }

  const createGroup = useMutation({
    mutationFn: (name: string) => createSharedGroup(name),
    onSuccess: invalidateMemberships,
  });

  const joinGroup = useMutation({
    mutationFn: (code: string) => joinGroupWithCode(code),
    onSuccess: invalidateMemberships,
  });

  const removeGroupMember = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      removeMember(groupId, userId),
    onSuccess: (_data, variables) => {
      invalidateMemberships();
      void queryClient.invalidateQueries({
        queryKey: queryKeys.groupMembers(variables.groupId),
      });
    },
  });

  return {
    createGroup,
    joinGroup,
    removeGroupMember,
    isCreating: createGroup.isPending,
    isJoining: joinGroup.isPending,
    isRemoving: removeGroupMember.isPending,
  };
}
```

- [ ] **Step 3: Écrire le hook de lecture des membres**

`src/hooks/use-group-members.ts` :

```ts
import { useQuery } from '@tanstack/react-query';

import { listGroupMembers } from '@/data/groups';
import { queryKeys } from '@/lib/query-keys';

/** Membres d'un groupe, avec leur rôle. Désactivé tant que groupId est vide. */
export function useGroupMembers(groupId: string) {
  const { data, isLoading, error, isLoadingError } = useQuery({
    queryKey: queryKeys.groupMembers(groupId),
    queryFn: () => listGroupMembers(groupId),
    enabled: groupId !== '',
  });

  return { members: data ?? [], isLoading, error, isLoadingError };
}
```

- [ ] **Step 4: Écrire le hook d'invitation**

`src/hooks/use-group-invitation.ts` :

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createInvitation, getActiveInvitation, revokeInvitation } from '@/data/groups';
import { queryKeys } from '@/lib/query-keys';

/**
 * Invitation active d'un groupe (au plus une à la fois, spec section 1) et
 * ses mutations. Désactivé tant que groupId est vide.
 */
export function useGroupInvitation(groupId: string, createdBy: string | undefined) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.groupInvitation(groupId),
    queryFn: () => getActiveInvitation(groupId),
    enabled: groupId !== '',
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.groupInvitation(groupId) });
  }

  const generate = useMutation({
    mutationFn: () => createInvitation(groupId, createdBy as string),
    onSuccess: invalidate,
  });

  // Régénérer révoque l'invitation active avant d'en créer une nouvelle.
  const regenerate = useMutation({
    mutationFn: async (activeInvitationId: string) => {
      await revokeInvitation(activeInvitationId);
      return createInvitation(groupId, createdBy as string);
    },
    onSuccess: invalidate,
  });

  return {
    invitation: data ?? null,
    isLoading,
    error,
    generate,
    regenerate,
    isGenerating: generate.isPending || regenerate.isPending,
  };
}
```

- [ ] **Step 5: Vérifier**

Run: `npx tsc --noEmit && npm run lint`
Expected: propre.

- [ ] **Step 6: Commit**

```bash
git add src/lib/query-keys.ts src/hooks/use-group-mutations.ts src/hooks/use-group-members.ts src/hooks/use-group-invitation.ts
git commit -m "feat: hooks de mutation, membres et invitation d un groupe

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Écrans liste, création et adhésion

**Files:**
- Modify: `src/lib/data-errors.ts`
- Create: `src/app/(app)/groups.tsx`
- Create: `src/app/(app)/group-create.tsx`
- Create: `src/app/(app)/group-join.tsx`
- Modify: `src/app/(app)/_layout.tsx`

**Interfaces:**
- Consomme : `useActiveGroup` (`@/hooks/use-active-group`, déjà existant — `groups`, `activeGroupId`, `setActiveGroupId`), `useGroupMutations` (Task 3), `Screen`/`Button` (`@/components/ui/`).
- Produit : routes `/groups`, `/group-create`, `/group-join`. `dataErrorMessage` gagne un cas P0001, consommé par tous les écrans du plan qui l'appellent déjà.

Sur la liste, taper le corps d'une rangée l'active toujours (personnelle ou partagée) ; un chevron additionnel, affiché seulement sur les groupes partagés, ouvre le détail (`/group?id=`, Task 5) — deux affordances distinctes plutôt qu'une seule qui changerait de sens selon le type de groupe.

- [ ] **Step 1: Corriger `dataErrorMessage` pour le code générique P0001**

`join_group_with_code()` (code invalide, révoqué, déjà utilisé, expiré) et les gardes (`guard_personal_group_membership`, `guard_owner_orphan`) lèvent toutes un `raise exception` sans code explicite, donc avec le code générique Postgres `P0001` — plusieurs messages distincts partagent ce même code, donc `MESSAGES['P0001']` ne peut pas exister comme entrée fixe. `dataErrorMessage` retombait pourtant sur `GENERIC` dès qu'un `code` est présent, sans jamais regarder `error.message` dans ce cas : le message français précis écrit dans chaque `raise exception` (« Invitation introuvable », « Invitation expirée », …) n'atteignait donc jamais l'écran `/group-join`, qui en a pourtant besoin comme UX principale, pas comme filet de sécurité.

Dans `src/lib/data-errors.ts`, remplacer le corps de `dataErrorMessage` :

```ts
export function dataErrorMessage(error: unknown): string {
  if (hasCode(error)) {
    // P0001 est le code générique de tout `raise exception` sans code
    // explicite : plusieurs messages distincts le partagent (les gardes,
    // join_group_with_code()), donc pas de table de correspondance possible
    // ici — le message porté par l'exception est déjà le texte français à
    // afficher tel quel.
    if (error.code === 'P0001' && hasMessage(error)) {
      return error.message;
    }
    return MESSAGES[error.code] ?? GENERIC;
  }

  if (
    hasMessage(error) &&
    NETWORK_MESSAGE_PATTERNS.some((pattern) => error.message.includes(pattern))
  ) {
    return 'Pas de connexion. Réessayez.';
  }

  return GENERIC;
}
```

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit && npm run lint`
Expected: propre.

- [ ] **Step 3: Écrire l'écran liste**

`src/app/(app)/groups.tsx` :

```tsx
import { Link, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { useActiveGroup } from '@/hooks/use-active-group';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/**
 * Groupes de l'utilisateur (spec section 1, écran 7) : bascule du groupe
 * actif, création d'un groupe partagé, adhésion par code.
 *
 * `useActiveGroup().groups` est déjà chargée par ActiveGroupProvider : cet
 * écran n'ouvre aucune requête, il affiche et bascule ce qui existe déjà.
 */
export default function GroupsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { groups, activeGroupId, setActiveGroupId } = useActiveGroup();

  return (
    <Screen align="top">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={spacing.sm}
          onPress={() => router.back()}
        >
          <Text style={[styles.back, { color: colors.textMuted }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Groupes</Text>
      </View>

      <View style={styles.list}>
        {groups.map((group) => {
          const active = group.groupId === activeGroupId;
          return (
            <View
              key={group.groupId}
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Activer ${group.name}${active ? ', déjà actif' : ''}`}
                onPress={() => setActiveGroupId(group.groupId)}
                style={styles.rowMain}
              >
                {active ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
                <Text style={[styles.name, { color: colors.text }]}>{group.name}</Text>
              </Pressable>

              {!group.isPersonal ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Gérer ${group.name}`}
                  hitSlop={spacing.sm}
                  onPress={() => router.push(`/group?id=${group.groupId}`)}
                >
                  <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Link href="/group-create" asChild>
          <Pressable
            accessibilityRole="button"
            style={StyleSheet.flatten([styles.action, { borderColor: colors.border }])}
          >
            <Text style={[styles.actionLabel, { color: colors.text }]}>Créer un groupe partagé</Text>
          </Pressable>
        </Link>
        <Link href="/group-join" asChild>
          <Pressable
            accessibilityRole="button"
            style={StyleSheet.flatten([styles.action, { borderColor: colors.border }])}
          >
            <Text style={[styles.actionLabel, { color: colors.text }]}>Rejoindre un groupe</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  list: {
    gap: spacing.sm + 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
  chevron: {
    fontFamily: font.semibold,
    fontSize: 20,
  },
  actions: {
    gap: spacing.sm,
  },
  action: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
  },
  actionLabel: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
});
```

- [ ] **Step 4: Écrire l'écran de création**

`src/app/(app)/group-create.tsx` :

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/** Créer un groupe partagé (spec section 1, écran 7). formSheet, un seul champ. */
export default function GroupCreateScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setActiveGroupId } = useActiveGroup();
  const { createGroup, isCreating } = useGroupMutations();
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [errorText, setErrorText] = useState<string>();

  const valid = name.trim() !== '';

  function handleSubmit() {
    setTouched(true);
    setErrorText(undefined);
    if (!valid) {
      return;
    }
    createGroup.mutate(name.trim(), {
      onSuccess: (groupId) => {
        // Le groupe qu'on vient de créer devient le groupe actif : sinon
        // l'utilisateur resterait sur son compte personnel sans comprendre où
        // est passé le groupe qu'il vient de créer.
        setActiveGroupId(groupId);
        router.back();
      },
      onError: (error) => setErrorText(dataErrorMessage(error)),
    });
  }

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Créer un groupe partagé</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          hitSlop={spacing.sm}
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Text style={[styles.closeLabel, { color: colors.textMuted }]}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.form}>
        <TextInput
          accessibilityLabel="Nom du groupe"
          placeholder="Coloc, Famille…"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          autoFocus
          style={[
            styles.name,
            { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
          ]}
        />

        {touched && !valid ? (
          <Text style={[styles.error, { color: colors.danger }]}>Donnez un nom au groupe.</Text>
        ) : null}
        {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

        <Button title="Créer" loading={isCreating} onPress={handleSubmit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  closeButton: {
    padding: spacing.xs,
  },
  closeLabel: {
    fontFamily: font.semibold,
    fontSize: 18,
  },
  form: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  name: {
    fontFamily: font.semibold,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 13,
  },
});
```

- [ ] **Step 5: Écrire l'écran d'adhésion**

`src/app/(app)/group-join.tsx` :

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/**
 * Rejoindre un groupe par code d'invitation (spec section 1, écran 7).
 *
 * `join_group_with_code()` compare le code par égalité stricte, sans
 * normaliser la casse : la saisie passe en minuscules avant l'appel, puisque
 * la base génère toujours du hex minuscule (migration group_management).
 */
export default function GroupJoinScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setActiveGroupId } = useActiveGroup();
  const { joinGroup, isJoining } = useGroupMutations();
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const [errorText, setErrorText] = useState<string>();

  const valid = code.trim() !== '';

  function handleSubmit() {
    setTouched(true);
    setErrorText(undefined);
    if (!valid) {
      return;
    }
    joinGroup.mutate(code.trim().toLowerCase(), {
      onSuccess: (groupId) => {
        setActiveGroupId(groupId);
        router.back();
      },
      onError: (error) => setErrorText(dataErrorMessage(error)),
    });
  }

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Rejoindre un groupe</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          hitSlop={spacing.sm}
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Text style={[styles.closeLabel, { color: colors.textMuted }]}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.form}>
        <TextInput
          accessibilityLabel="Code d’invitation"
          placeholder="Code à 8 caractères"
          placeholderTextColor={colors.textMuted}
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          style={[
            styles.code,
            { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
          ]}
        />

        {touched && !valid ? (
          <Text style={[styles.error, { color: colors.danger }]}>Entrez le code reçu.</Text>
        ) : null}
        {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

        <Button title="Rejoindre" loading={isJoining} onPress={handleSubmit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  closeButton: {
    padding: spacing.xs,
  },
  closeLabel: {
    fontFamily: font.semibold,
    fontSize: 18,
  },
  form: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  code: {
    fontFamily: font.semibold,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
    letterSpacing: 2,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 13,
  },
});
```

- [ ] **Step 6: Enregistrer les trois routes**

Dans `src/app/(app)/_layout.tsx`, ajouter après `<Stack.Screen name="savings-goal" ... />` et avant `<Stack.Screen name="transaction" ... />` :

```tsx
      <Stack.Screen name="groups" />
      <Stack.Screen
        name="group-create"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
        }}
      />
      <Stack.Screen
        name="group-join"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
        }}
      />
```

(La route `group` du détail, écran plein, sera ajoutée juste après par la Task 5 — pas de bloc de plus pour elle ici.)

- [ ] **Step 7: Vérifier**

Run: `npx tsc --noEmit && npm run lint`

Si `tsc` refuse `href="/groups"`, `href="/group-create"` ou `href="/group-join"` (typedRoutes pas encore régénéré) : lancer `npx expo start` une fois en arrière-plan pour régénérer `.expo/types/router.d.ts`, puis l'arrêter, puis relancer `npx tsc --noEmit`.

Expected : propre.

- [ ] **Step 8: Commit**

```bash
git add src/lib/data-errors.ts "src/app/(app)/groups.tsx" "src/app/(app)/group-create.tsx" "src/app/(app)/group-join.tsx" "src/app/(app)/_layout.tsx"
git commit -m "feat: ecrans liste, creation et adhesion a un groupe

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Écran détail d'un groupe — membres, invitation, quitter

**Files:**
- Modify: `src/app/(app)/_layout.tsx`
- Create: `src/app/(app)/group.tsx`
- Modify: `package.json`, `package-lock.json` (via `npx expo install expo-clipboard`)

**Interfaces:**
- Consomme : `useActiveGroup` (nom et rôle du groupe, déjà chargés), `useGroupMembers`, `useGroupInvitation`, `useGroupMutations` (Task 3), `useAuth` (`@/hooks/use-auth`), `expo-clipboard`.
- Produit : route `/group?id=`.

- [ ] **Step 1: Installer `expo-clipboard`**

Run: `npx expo install expo-clipboard`
Expected: ajoute `expo-clipboard` à `package.json` à la version compatible SDK 57.

- [ ] **Step 2: Écrire l'écran**

`src/app/(app)/group.tsx` :

```tsx
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import { useGroupInvitation } from '@/hooks/use-group-invitation';
import { useGroupMembers } from '@/hooks/use-group-members';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/**
 * Membres, invitation, exclusion et départ d'un groupe partagé (spec
 * section 1, écran 7).
 *
 * Le nom du groupe vient de useActiveGroup().groups, déjà chargée : cet
 * écran n'ouvre de requête que pour les membres et l'invitation.
 */
export default function GroupScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  // Garde qui évite une assertion non sûre plutôt que de documenter un cas
  // impossible : cette route n'est jamais ouverte sans id depuis groups.tsx.
  const id = typeof rawId === 'string' ? rawId : '';
  const { session } = useAuth();
  const userId = session?.user.id;
  const { groups } = useActiveGroup();
  const group = groups.find((item) => item.groupId === id);

  const {
    members,
    isLoading: membersLoading,
    error: membersError,
    isLoadingError,
  } = useGroupMembers(id);
  const {
    invitation,
    isLoading: invitationLoading,
    generate,
    regenerate,
    isGenerating,
  } = useGroupInvitation(id, userId);
  const { removeGroupMember, isRemoving } = useGroupMutations();
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string>();

  const me = members.find((member) => member.userId === userId);
  const isOwner = me?.role === 'owner';
  const hasOtherMembers = members.length > 1;

  const blockingError: unknown = id === '' ? null : isLoadingError ? membersError : null;

  function handleExclude(targetUserId: string) {
    setActionError(undefined);
    removeGroupMember.mutate(
      { groupId: id, userId: targetUserId },
      { onError: (error) => setActionError(dataErrorMessage(error)) }
    );
  }

  function handleLeave() {
    if (!userId) {
      return;
    }
    setActionError(undefined);
    removeGroupMember.mutate(
      { groupId: id, userId },
      {
        onSuccess: () => router.back(),
        onError: (error) => setActionError(dataErrorMessage(error)),
      }
    );
  }

  async function handleCopy() {
    if (!invitation) {
      return;
    }
    await Clipboard.setStringAsync(invitation.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (id === '') {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>Groupe introuvable.</Text>
        <Button title="Retour" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <Screen align="top">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={spacing.sm}
          onPress={() => router.back()}
        >
          <Text style={[styles.back, { color: colors.textMuted }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{group?.name ?? '…'}</Text>
      </View>

      {blockingError ? (
        <Text style={[styles.message, { color: colors.danger }]}>
          {dataErrorMessage(blockingError)}
        </Text>
      ) : membersLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Membres</Text>
            <View style={styles.list}>
              {members.map((member) => (
                <View key={member.userId} style={[styles.memberRow, { borderColor: colors.border }]}>
                  <View style={styles.memberInfo}>
                    <Text style={[styles.memberName, { color: colors.text }]}>
                      {member.displayName}
                    </Text>
                    <Text style={[styles.memberRole, { color: colors.textMuted }]}>
                      {member.role === 'owner' ? 'Propriétaire' : 'Membre'}
                    </Text>
                  </View>
                  {isOwner && member.userId !== userId ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Exclure ${member.displayName}`}
                      disabled={isRemoving}
                      onPress={() => handleExclude(member.userId)}
                    >
                      <Text style={[styles.exclude, { color: colors.danger }]}>Exclure</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Invitation</Text>
            {invitationLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : invitation ? (
              <View style={styles.invitationRow}>
                <Text style={[styles.code, { color: colors.text }]}>{invitation.code}</Text>
                <Pressable accessibilityRole="button" onPress={() => void handleCopy()}>
                  <Text style={[styles.link, { color: colors.primary }]}>
                    {copied ? 'Copié !' : 'Copier'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isGenerating}
                  onPress={() => regenerate.mutate(invitation.id)}
                >
                  <Text style={[styles.link, { color: colors.primary }]}>Régénérer</Text>
                </Pressable>
              </View>
            ) : (
              <Button
                title="Générer un code"
                loading={isGenerating}
                onPress={() => generate.mutate()}
              />
            )}
          </View>

          {actionError ? (
            <Text style={[styles.message, { color: colors.danger }]}>{actionError}</Text>
          ) : null}

          <View style={styles.section}>
            {isOwner && hasOtherMembers ? (
              <Text style={[styles.message, { color: colors.textMuted }]}>
                Vous devez d’abord exclure les autres membres pour pouvoir quitter ce groupe.
              </Text>
            ) : null}
            <Button
              title="Quitter le groupe"
              variant="ghost"
              disabled={isOwner && hasOtherMembers}
              loading={isRemoving}
              onPress={handleLeave}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    flexShrink: 1,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: font.semibold,
    fontSize: 10.5,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
  },
  list: {
    gap: spacing.xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberInfo: {
    flexShrink: 1,
  },
  memberName: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
  memberRole: {
    fontFamily: font.medium,
    fontSize: 12.5,
  },
  exclude: {
    fontFamily: font.semibold,
    fontSize: 13,
  },
  invitationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  code: {
    fontFamily: font.bold,
    fontSize: 18,
    letterSpacing: 2,
    flexShrink: 0,
  },
  link: {
    fontFamily: font.semibold,
    fontSize: 13,
  },
  message: {
    fontFamily: font.regular,
    fontSize: 13,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  errorTitle: {
    fontFamily: font.medium,
    fontSize: 14,
    textAlign: 'center',
  },
});
```

Note : `styles.action`/`styles.actionLabel`/`styles.rowMain`/`styles.dot`/`styles.chevron` de `groups.tsx` (Task 4) ne sont pas réutilisés ici — ce fichier a son propre `StyleSheet.create`, radius/spacing importés directement.

- [ ] **Step 3: Enregistrer la route**

Dans `src/app/(app)/_layout.tsx`, ajouter juste après le bloc `group-join` ajouté à la Task 4 :

```tsx
      <Stack.Screen name="group" />
```

- [ ] **Step 4: Vérifier**

Run: `npx tsc --noEmit && npm run lint`
Expected : propre.

Run : `npx expo export --platform android --output-dir <dossier scratch>`
Expected : export réussi. En cas d'échec natif de `hermesc.exe` sans erreur JS/TS, relancer une fois dans un nouveau dossier avant de conclure à un vrai problème.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json "src/app/(app)/group.tsx" "src/app/(app)/_layout.tsx"
git commit -m "feat: ecran de gestion d un groupe partage (membres, invitation, quitter)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Entrée du tableau de bord

**Files:**
- Modify: `src/app/(app)/index.tsx`

**Interfaces:**
- Consomme : `useActiveGroup` (déjà utilisée dans ce fichier).
- Produit : rien de nouveau pour d'autres tâches — dernière tâche de code de ce plan.

L'en-tête du tableau de bord affiche déjà le nom du groupe actif ; son commentaire annonce explicitement que le changement de groupe « arrive à l'écran 7 ». Cette tâche transforme cet en-tête en lien vers `/groups`.

- [ ] **Step 1: Rendre l'en-tête du groupe actif cliquable**

Dans `src/app/(app)/index.tsx`, ajouter l'import `Link` s'il ne l'est pas déjà (il l'est, ligne 1). Remplacer le commentaire et le bloc `<View style={styles.header}>` :

```tsx
      {/* Le nom du groupe est une étiquette, pas un titre : c'est le solde
          qui domine l'écran. Le mettre en grand inversait la hiérarchie et
          faisait passer l'information principale au second plan.

          Ouvre /groups (écran 7) : bascule de groupe actif, création,
          adhésion, gestion des membres. */}
      <Link href="/groups" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Groupe actif : ${activeGroup?.name ?? '…'}. Gérer les groupes`}
          style={StyleSheet.flatten([styles.header])}
        >
          <View style={[styles.groupDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.groupName, { color: colors.textMuted }]}>
            {activeGroup?.name ?? '…'}
          </Text>
          <Text style={[styles.groupChevron, { color: colors.textMuted }]}>›</Text>
        </Pressable>
      </Link>
```

Ajouter le style `groupChevron` à la fin du `StyleSheet.create`, juste après `groupName` :

```ts
  groupChevron: {
    fontFamily: font.semibold,
    fontSize: 13,
  },
```

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: propre, Jest toujours au vert (aucun test existant ne touche ce fichier).

Run: `npx expo export --platform android --output-dir <dossier scratch>`
Expected: export réussi.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/index.tsx"
git commit -m "feat: le nom du groupe actif ouvre la gestion des groupes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Vérification manuelle sur appareil (par l'utilisateur)

Aucun composant ni hook n'a de test automatisé dans ce projet. À vérifier avec `npx expo start --clear` sur téléphone, **en mode développement** (c'est le seul où l'erreur `Slot` d'un style non aplati se voit), idéalement avec deux comptes ou deux appareils pour les scénarios à plusieurs membres :

1. Tableau de bord : taper le nom du groupe actif ouvre `/groups`.
2. `/groups` liste le compte personnel en tête, sans chevron ; taper son nom l'active (déjà actif au départ, rien ne change visuellement à part la confirmation).
3. « Créer un groupe partagé » : nommer un groupe, valider — il apparaît dans la liste, devient actif (pastille), le tableau de bord affiche son nom.
4. Depuis `/groups`, taper le chevron du groupe créé ouvre son détail : un seul membre (soi-même, Propriétaire), pas de bouton Exclure sur sa propre ligne.
5. « Générer un code » : un code à 8 caractères apparaît ; « Copier » colle bien ce code dans le presse-papiers (coller ailleurs pour vérifier) ; « Régénérer » change le code affiché.
6. Avec un second compte : rejoindre le groupe via `/group-join` et le code généré à l'étape 5 (en minuscules ou majuscules, les deux doivent fonctionner). Le groupe apparaît dans les groupes du second compte, devient son groupe actif.
7. Sur le premier compte, rafraîchir le détail du groupe : le second membre apparaît (Realtime, `account_memberships` étant déjà dans la publication — pas de délai perceptible au-delà d'un aller-retour réseau).
8. Sur le premier compte (propriétaire), taper « Quitter le groupe » : désactivé, avec le texte explicatif, tant que le second membre est présent.
9. Exclure le second membre depuis le détail : sa ligne disparaît ; sur son appareil, le groupe disparaît de sa liste (ou son groupe actif retombe sur son compte personnel s'il l'avait laissé actif).
10. Une fois seul membre restant, « Quitter le groupe » redevient actif sur le premier compte ; le confirmer renvoie à `/groups`, le groupe (désormais sans membre) n'apparaît plus dans sa liste.
11. Un code invalide, expiré ou déjà utilisé dans `/group-join` affiche le message d'erreur renvoyé par `join_group_with_code()`, pas un message générique.

Ce dernier point boucle la vérification : aucune étape ne doit produire l'erreur générique « Une erreur inattendue est survenue » sauf celles qui la testent explicitement.
