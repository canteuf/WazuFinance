# Budgets par catégorie — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un groupe de fixer un plafond de dépense par catégorie et de suivre sa consommation en cours de période, avec une alerte visuelle à 80 % et à 100 %.

**Architecture:** Aucune migration — la table `budgets` et ses policies RLS existent depuis le schéma initial. La dépense de la période vient de la RPC `category_breakdown` déjà en place ; un module pur rapproche budgets et dépenses par `category_id` et rend le statut. L'écran 5 liste les budgets définis, un formulaire en `formSheet` les crée et les modifie, et une ligne permanente sur le dashboard sert à la fois de point d'entrée et d'alerte.

**Tech Stack:** Expo SDK 57, expo-router v6, React 19.2, React Native 0.86, TypeScript strict, TanStack Query v5, Supabase (PostgREST + Realtime), Jest (jest-expo), pgTAP.

**Spec:** [docs/superpowers/specs/2026-09-09-budgets-par-categorie-design.md](../specs/2026-09-09-budgets-par-categorie-design.md)

## Global Constraints

- TypeScript strict, **aucun `any`**.
- Chaînes visibles en français, identifiants de code en anglais. Commentaires SQL en français.
- Fichiers en kebab-case, composants en PascalCase.
- `src/types/database.ts` est **généré** — ne jamais l'éditer à la main.
- Couches à sens unique : `écrans → hooks → src/data/ → supabase`. Un écran n'importe jamais `supabase` ; `src/data/` n'importe jamais React.
- Toutes les clés de cache vivent dans `src/lib/query-keys.ts`.
- Les erreurs de données passent par `dataErrorMessage()` de `src/lib/data-errors.ts`, mappé par code SQLSTATE.
- `period` est toujours écrit à `'monthly'` — l'enum accepte `'weekly'`, l'interface ne l'expose pas.
- Vérification à chaque tâche : `npx tsc --noEmit` **et** `npm run lint` doivent être propres. Le lint est aussi facile à oublier qu'à casser (`react/no-unescaped-entities` se déclenche sur une apostrophe droite dans du JSX : écrire `’`, U+2019).
- `npm run test:db` exige Docker Desktop démarré puis `npx supabase start`. Si le stack a été restauré depuis une sauvegarde plutôt que migré, lancer `npx supabase db reset`.
- Aucune migration dans ce plan : rien à pousser en production.

---

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité |
|---|---|
| `src/data/budgets.ts` | Lecture et écriture des budgets via PostgREST. |
| `src/lib/budget-progress.ts` | Module pur : rapprochement plafond/dépense, statut, tri. |
| `src/lib/budget-progress.test.ts` | Tests Jest du module ci-dessus. |
| `supabase/tests/budgets_rls_test.sql` | pgTAP : policies et contraintes de la table `budgets`. |
| `src/hooks/use-budgets.ts` | Budgets du groupe actif. |
| `src/hooks/use-budget-progress.ts` | Composition budgets + dépenses de la période. |
| `src/hooks/use-budget-mutations.ts` | Création, modification, suppression. |
| `src/hooks/use-budgets-realtime.ts` | Abonnement Realtime sur `budgets`. |
| `src/components/budget/budget-row.tsx` | Une ligne de l'écran 5. |
| `src/components/budget/budget-form.tsx` | Formulaire partagé création/édition. |
| `src/components/dashboard/budgets-entry.tsx` | Ligne du dashboard : point d'entrée + alerte. |
| `src/app/(app)/budgets.tsx` | Écran 5. |
| `src/app/(app)/budget.tsx` | Feuille de création/édition. |

**Modifiés :**

| Fichier | Modification |
|---|---|
| `src/lib/query-keys.ts` | Ajout de `budgets(groupId)`. |
| `src/lib/data-errors.ts` | Message de `23505` repointé. |
| `src/theme/tokens.ts` | Ajout du jeton `warning` aux deux palettes. |
| `src/app/(app)/_layout.tsx` | Enregistrement des deux routes + montage du hook Realtime. |
| `src/app/(app)/index.tsx` | Montage de `<BudgetsEntry />`. |
| `CLAUDE.md` | Règles acquises. |

---

## Task 1: Couche données des budgets

**Files:**
- Create: `src/data/budgets.ts`
- Modify: `src/lib/query-keys.ts`

**Interfaces:**
- Consumes: `Tables<'budgets'>` de `@/types/database`, `supabase` de `@/lib/supabase`.
- Produces:
  ```ts
  export type BudgetWithCategory = Tables<'budgets'> & {
    category: { id: string; name: string; icon: string };
  };
  export type CreateBudgetInput = { groupId: string; categoryId: string; amount: number };
  export type UpdateBudgetInput = { amount: number };
  export function listForGroup(groupId: string): Promise<BudgetWithCategory[]>;
  export function create(input: CreateBudgetInput): Promise<Tables<'budgets'>>;
  export function update(id: string, patch: UpdateBudgetInput): Promise<Tables<'budgets'>>;
  export function remove(id: string): Promise<void>;
  export const queryKeys.budgets: (groupId: string) => readonly ['budgets', string];
  ```

**Note sur le typage de l'embed :** `budgets.category_id` est `not null references categories(id)`, donc supabase-js infère la catégorie embarquée comme non nulle et `return data;` doit typer. Si `tsc` la donne malgré tout nullable, garder le type nullable dans `BudgetWithCategory` plutôt que d'écrire un `as` — un cast masquerait un désaccord réel entre le schéma et les types générés.

- [ ] **Step 1: Écrire `src/data/budgets.ts`**

```ts
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type BudgetWithCategory = Tables<'budgets'> & {
  category: { id: string; name: string; icon: string };
};

const SELECT_WITH_CATEGORY = '*, category:categories(id, name, icon)';

/**
 * Budgets du groupe, catégorie embarquée.
 *
 * La jointure est faite par PostgREST, comme pour les transactions : une
 * seconde requête sur `categories` obligerait à rapprocher les deux côté
 * client alors que la base sait le faire.
 *
 * Le tri par nom de catégorie n'est pas l'ordre d'affichage final — l'écran
 * remonte les budgets en alerte — mais il rend la lecture brute stable, ce
 * qui compte quand on inspecte la réponse.
 */
export async function listForGroup(groupId: string): Promise<BudgetWithCategory[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select(SELECT_WITH_CATEGORY)
    .eq('group_id', groupId)
    .order('name', { ascending: true, referencedTable: 'categories' });

  if (error) {
    throw error;
  }

  return data;
}

export type CreateBudgetInput = {
  groupId: string;
  categoryId: string;
  amount: number;
};

export type UpdateBudgetInput = {
  amount: number;
};

/**
 * `period` est écrit en dur à 'monthly'.
 *
 * L'enum `budget_period` accepte aussi 'weekly', que la V1 n'expose pas : un
 * budget suit la période budgétaire du groupe (period_start_day), la même que
 * le solde et la répartition. Le jour où l'hebdomadaire arrivera, il faudra
 * une seconde fonction de bornes et une convention de début de semaine — ce
 * n'est pas une valeur à faire remonter dans le formulaire en attendant.
 */
export async function create(input: CreateBudgetInput): Promise<Tables<'budgets'>> {
  const { data, error } = await supabase
    .from('budgets')
    .insert({
      group_id: input.groupId,
      category_id: input.categoryId,
      period: 'monthly',
      amount: input.amount,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function update(
  id: string,
  patch: UpdateBudgetInput
): Promise<Tables<'budgets'>> {
  const { data, error } = await supabase
    .from('budgets')
    .update({ amount: patch.amount })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function remove(id: string): Promise<void> {
  const { error } = await supabase.from('budgets').delete().eq('id', id);

  if (error) {
    throw error;
  }
}
```

- [ ] **Step 2: Ajouter la clé de cache**

Dans `src/lib/query-keys.ts`, après la ligne `transactions: () => ['transactions'] as const,` :

```ts
  // Hors de ['transactions'] à dessein, contrairement à periodSummary et
  // categoryBreakdown : un budget n'est pas dérivé des transactions. L'y
  // nicher ferait recharger les plafonds à chaque saisie de dépense.
  budgets: (groupId: string) => ['budgets', groupId] as const,
```

- [ ] **Step 3: Vérifier**

```bash
npx tsc --noEmit
npm run lint
```

Attendu : aucune erreur. Si `tsc` signale que `data` n'est pas assignable parce que `category` est inféré nullable, changer le type en `category: { id: string; name: string; icon: string } | null` — ne pas ajouter de `as`.

- [ ] **Step 4: Commit**

```bash
git add src/data/budgets.ts src/lib/query-keys.ts
git commit -m "feat: couche donnees des budgets"
```

---

## Task 2: Module de progression (TDD)

**Files:**
- Create: `src/lib/budget-progress.ts`
- Test: `src/lib/budget-progress.test.ts`

**Interfaces:**
- Consumes: `BudgetWithCategory` de `@/data/budgets`, `CategorySlice` de `@/data/summary`.
- Produces:
  ```ts
  export const WARNING_RATIO = 0.8;
  export type BudgetStatus = 'ok' | 'warning' | 'over';
  export type BudgetProgress = {
    budget: BudgetWithCategory;
    spent: number;
    remaining: number;   // signé : négatif en dépassement
    ratio: number;       // peut dépasser 1
    status: BudgetStatus;
  };
  export function budgetProgress(
    budgets: BudgetWithCategory[],
    slices: CategorySlice[]
  ): BudgetProgress[];
  ```

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/lib/budget-progress.test.ts` :

```ts
import { budgetProgress, WARNING_RATIO } from '@/lib/budget-progress';
import type { BudgetWithCategory } from '@/data/budgets';
import type { CategorySlice } from '@/data/summary';

function budget(categoryId: string, amount: number, name = 'Catégorie'): BudgetWithCategory {
  return {
    id: `budget-${categoryId}`,
    group_id: 'group-1',
    category_id: categoryId,
    period: 'monthly',
    amount,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    category: { id: categoryId, name, icon: 'cart' },
  };
}

function slice(categoryId: string, total: number): CategorySlice {
  return { categoryId, name: 'Catégorie', icon: 'cart', total };
}

describe('budgetProgress', () => {
  it('rapproche un budget de sa dépense par catégorie', () => {
    const [row] = budgetProgress([budget('cat-1', 200)], [slice('cat-1', 50)]);

    expect(row.spent).toBe(50);
    expect(row.remaining).toBe(150);
    expect(row.ratio).toBeCloseTo(0.25);
    expect(row.status).toBe('ok');
  });

  it('donne zéro dépensé à une catégorie absente de la répartition', () => {
    // category_breakdown fait une jointure interne : une catégorie sans
    // dépense n'y figure pas du tout, elle n'y figure pas à zéro.
    const [row] = budgetProgress([budget('cat-1', 200)], []);

    expect(row.spent).toBe(0);
    expect(row.ratio).toBe(0);
    expect(row.status).toBe('ok');
  });

  it('ignore une dépense sans budget correspondant', () => {
    const rows = budgetProgress([budget('cat-1', 200)], [slice('cat-2', 900)]);

    expect(rows).toHaveLength(1);
    expect(rows[0].spent).toBe(0);
  });

  it('passe en alerte exactement au seuil, pas seulement au-delà', () => {
    const [row] = budgetProgress(
      [budget('cat-1', 200)],
      [slice('cat-1', 200 * WARNING_RATIO)]
    );

    expect(row.status).toBe('warning');
  });

  it('reste ok juste sous le seuil', () => {
    const [row] = budgetProgress([budget('cat-1', 200)], [slice('cat-1', 159.99)]);

    expect(row.status).toBe('ok');
  });

  it('passe en dépassement exactement à 100 %', () => {
    const [row] = budgetProgress([budget('cat-1', 200)], [slice('cat-1', 200)]);

    expect(row.status).toBe('over');
    expect(row.remaining).toBe(0);
  });

  it('rend un reste négatif et un ratio supérieur à 1 au-delà du plafond', () => {
    const [row] = budgetProgress([budget('cat-1', 200)], [slice('cat-1', 290)]);

    expect(row.remaining).toBe(-90);
    expect(row.ratio).toBeCloseTo(1.45);
    expect(row.status).toBe('over');
  });

  it('remonte les dépassements, puis les alertes, puis le reste par ratio décroissant', () => {
    const rows = budgetProgress(
      [
        budget('calme', 200, 'Calme'),
        budget('depasse', 100, 'Dépassé'),
        budget('proche', 100, 'Proche'),
        budget('tiede', 200, 'Tiède'),
      ],
      [
        slice('calme', 10),
        slice('depasse', 150),
        slice('proche', 85),
        slice('tiede', 100),
      ]
    );

    expect(rows.map((row) => row.budget.category.name)).toEqual([
      'Dépassé',
      'Proche',
      'Tiède',
      'Calme',
    ]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
npm test -- budget-progress
```

Attendu : ÉCHEC — `Cannot find module '@/lib/budget-progress'`.

- [ ] **Step 3: Écrire le module**

Créer `src/lib/budget-progress.ts` :

```ts
import type { BudgetWithCategory } from '@/data/budgets';
import type { CategorySlice } from '@/data/summary';

/**
 * Seuil d'avertissement de la spec 2.4.
 *
 * Nommé et exporté plutôt qu'écrit dans le JSX : les tests s'en servent pour
 * viser la borne exacte, et le régler un jour se fait à un seul endroit.
 */
export const WARNING_RATIO = 0.8;

export type BudgetStatus = 'ok' | 'warning' | 'over';

export type BudgetProgress = {
  budget: BudgetWithCategory;
  spent: number;
  /** Signé : négatif en dépassement. L'affichage choisit le mot et prend la valeur absolue. */
  remaining: number;
  /** Peut dépasser 1 : c'est l'affichage qui plafonne la barre, pas le calcul. */
  ratio: number;
  status: BudgetStatus;
};

/** Les alertes en tête : c'est l'ordre utile, pas l'ordre alphabétique. */
const STATUS_RANK: Record<BudgetStatus, number> = {
  over: 0,
  warning: 1,
  ok: 2,
};

function statusFor(ratio: number): BudgetStatus {
  if (ratio >= 1) {
    return 'over';
  }
  if (ratio >= WARNING_RATIO) {
    return 'warning';
  }
  return 'ok';
}

/**
 * Rapproche chaque budget de la dépense de sa catégorie sur la période.
 *
 * Les deux ensembles viennent de deux requêtes portant les mêmes bornes :
 * `listForGroup` pour les plafonds, `category_breakdown` pour les dépenses.
 * La somme des montants a déjà été faite par Postgres sur du numeric(12,2) ;
 * il ne reste ici qu'une correspondance par identifiant et une division de
 * deux valeurs exactes. Additionner des montants ici, en revanche, passerait
 * par des flottants binaires — ne pas le faire.
 *
 * `budget.amount > 0` est garanti par la contrainte `check (amount > 0)` de la
 * table : pas de garde contre la division par zéro, elle serait du code mort.
 */
export function budgetProgress(
  budgets: BudgetWithCategory[],
  slices: CategorySlice[]
): BudgetProgress[] {
  const spentByCategory = new Map(slices.map((slice) => [slice.categoryId, slice.total]));

  return budgets
    .map((budget) => {
      // Absente de la répartition : la jointure interne de category_breakdown
      // écarte les catégories sans dépense, elle ne les rend pas à zéro.
      const spent = spentByCategory.get(budget.category_id) ?? 0;
      const limit = Number(budget.amount);
      const ratio = spent / limit;

      return {
        budget,
        spent,
        remaining: limit - spent,
        ratio,
        status: statusFor(ratio),
      };
    })
    .sort((a, b) => {
      const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      return byStatus !== 0 ? byStatus : b.ratio - a.ratio;
    });
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
npm test -- budget-progress
```

Attendu : 8 tests au vert.

- [ ] **Step 5: Vérifier l'ensemble**

```bash
npx tsc --noEmit
npm run lint
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/budget-progress.ts src/lib/budget-progress.test.ts
git commit -m "feat: module de progression des budgets"
```

---

## Task 3: Tests pgTAP des policies `budgets`

**Files:**
- Create: `supabase/tests/budgets_rls_test.sql`

**Interfaces:**
- Consumes: le schéma existant (`budgets`, `budget_groups`, `account_memberships`, `categories`).
- Produces: rien pour le code applicatif — une couverture de sécurité.

**Contexte :** la table `budgets` porte quatre policies (`budgets_select_member`, `_insert_member`, `_update_member`, `_delete_member`) qu'aucun test n'exerce aujourd'hui. L'écran 5 est le moment où elle commence à servir.

**Pièges des fixtures :** les UUID doivent être hexadécimaux — `g` n'est pas un chiffre hexadécimal et fait échouer l'insertion avec un message qui ne pointe pas la vraie cause. Les suffixes `d1`, `d2`, `d3` ci-dessous sont libres dans les autres fichiers de test.

- [ ] **Step 1: Écrire le fichier de test**

```sql
-- Policies et contraintes de la table budgets.
--
-- Quatre choses à prouver : un membre lit et écrit les budgets de son groupe,
-- un étranger ne lit rien et ne peut rien insérer, le triplet
-- (group_id, category_id, period) reste unique, et amount > 0 est tenu.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'membre@example.com',  '{"display_name": "Membre"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000d2', 'etranger@example.com', '{"display_name": "Etranger"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000d3', 'Colocation',
        '00000000-0000-0000-0000-0000000000d1', false);

insert into public.account_memberships (group_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000d3',
        '00000000-0000-0000-0000-0000000000d1', 'owner');

insert into public.budgets (group_id, category_id, period, amount)
values ('00000000-0000-0000-0000-0000000000d3',
        (select id from public.categories where group_id is null and name = 'Alimentation'),
        'monthly', 300.00);

-- ---------------------------------------------------------------------------
-- Le membre
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.budgets
    where group_id = '00000000-0000-0000-0000-0000000000d3'),
  1,
  'Un membre lit les budgets de son groupe'
);

-- Un second budget sur la même catégorie et la même cadence : le triplet
-- unique existe pour qu'un doublon soit impossible même en cas de course
-- entre deux membres, le formulaire ne pouvant l'empêcher.
SELECT throws_ok(
  $$insert into public.budgets (group_id, category_id, period, amount)
    values ('00000000-0000-0000-0000-0000000000d3',
            (select id from public.categories where group_id is null and name = 'Alimentation'),
            'monthly', 500.00)$$,
  '23505',
  NULL,
  'Un second budget sur la meme categorie et la meme cadence est refuse'
);

SELECT throws_ok(
  $$insert into public.budgets (group_id, category_id, period, amount)
    values ('00000000-0000-0000-0000-0000000000d3',
            (select id from public.categories where group_id is null and name = 'Transport'),
            'monthly', 0)$$,
  '23514',
  NULL,
  'Un plafond nul est refuse par la contrainte check'
);

-- ---------------------------------------------------------------------------
-- L'étranger au groupe
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.budgets
    where group_id = '00000000-0000-0000-0000-0000000000d3'),
  0,
  'Un non-membre ne lit aucun budget du groupe'
);

SELECT throws_ok(
  $$insert into public.budgets (group_id, category_id, period, amount)
    values ('00000000-0000-0000-0000-0000000000d3',
            (select id from public.categories where group_id is null and name = 'Transport'),
            'monthly', 100.00)$$,
  '42501',
  NULL,
  'Un non-membre ne peut pas creer de budget dans le groupe'
);

-- Un UPDATE que la policy ne laisse pas voir ne lève pas d'erreur : il ne
-- touche simplement aucune ligne. C'est le comportement normal de RLS sur
-- UPDATE, et c'est bien l'absence d'effet qu'il faut prouver.
SELECT lives_ok(
  $$update public.budgets set amount = 1.00
     where group_id = '00000000-0000-0000-0000-0000000000d3'$$,
  'Un non-membre ne modifie aucune ligne, sans erreur'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Lancer la suite pgTAP**

```bash
npx supabase start
npm run test:db
```

Attendu : les 6 assertions de ce fichier au vert, et les fichiers existants toujours au vert (55 assertions au total).

Si une fonction manque (`period_summary does not exist`), le stack a été restauré depuis une sauvegarde au lieu d'appliquer les migrations : lancer `npx supabase db reset` puis relancer.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/budgets_rls_test.sql
git commit -m "test: policies et contraintes de la table budgets"
```

---

## Task 4: Hooks de lecture et de mutation

**Files:**
- Create: `src/hooks/use-budgets.ts`
- Create: `src/hooks/use-budget-progress.ts`
- Create: `src/hooks/use-budget-mutations.ts`

**Interfaces:**
- Consumes: `listForGroup`, `create`, `update`, `remove`, `BudgetWithCategory`, `CreateBudgetInput`, `UpdateBudgetInput` (Task 1) ; `budgetProgress`, `BudgetProgress` (Task 2) ; `useActiveGroup()` qui rend `{ activeGroupId: string | null, activeGroup: { periodStartDay: number } | undefined, isLoading, error }` ; `useCategoryBreakdown()` qui rend `{ slices: CategorySlice[], isLoading, error }`.
- Produces:
  ```ts
  export function useBudgets(): { budgets: BudgetWithCategory[]; isLoading: boolean; error: unknown };
  export function useBudgetProgress(): { items: BudgetProgress[]; isLoading: boolean; error: unknown };
  export function useBudgetMutations(): {
    createBudget: UseMutationResult<Tables<'budgets'>, Error, CreateBudgetInput>;
    updateBudget: UseMutationResult<Tables<'budgets'>, Error, { id: string; patch: UpdateBudgetInput }>;
    deleteBudget: UseMutationResult<void, Error, string>;
    isSaving: boolean;
    isDeleting: boolean;
  };
  ```

- [ ] **Step 1: Écrire `src/hooks/use-budgets.ts`**

```ts
import { useQuery } from '@tanstack/react-query';

import { listForGroup, type BudgetWithCategory } from '@/data/budgets';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';

/** Plafonds définis dans le groupe actif. Sans bornes de date : un plafond ne dépend pas de la période. */
export function useBudgets(): {
  budgets: BudgetWithCategory[];
  isLoading: boolean;
  error: unknown;
} {
  const { activeGroupId } = useActiveGroup();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.budgets(activeGroupId ?? ''),
    queryFn: () => listForGroup(activeGroupId as string),
    enabled: activeGroupId !== null,
  });

  return { budgets: data ?? [], isLoading, error };
}
```

- [ ] **Step 2: Écrire `src/hooks/use-budget-progress.ts`**

```ts
import { useMemo } from 'react';

import { useBudgets } from '@/hooks/use-budgets';
import { useCategoryBreakdown } from '@/hooks/use-category-breakdown';
import { budgetProgress, type BudgetProgress } from '@/lib/budget-progress';

/**
 * Budgets rapprochés des dépenses de la période en cours.
 *
 * Les bornes viennent de `useCategoryBreakdown`, donc les mêmes que le solde
 * et la répartition du tableau de bord : un plafond comparé à une autre
 * période que celle affichée en tête d'écran serait un chiffre faux.
 *
 * Les deux requêtes sont indépendantes et déjà en cache pour l'une d'elles :
 * la répartition est lue par le tableau de bord, donc le bandeau ne coûte que
 * la lecture des plafonds.
 */
export function useBudgetProgress(): {
  items: BudgetProgress[];
  isLoading: boolean;
  error: unknown;
} {
  const budgets = useBudgets();
  const breakdown = useCategoryBreakdown();

  const items = useMemo(
    () => budgetProgress(budgets.budgets, breakdown.slices),
    [budgets.budgets, breakdown.slices]
  );

  return {
    items,
    // Les deux comptent : afficher des plafonds sans leur consommation
    // montrerait un instant chaque budget à 0 %, donc tous « ok ».
    isLoading: budgets.isLoading || breakdown.isLoading,
    error: budgets.error ?? breakdown.error,
  };
}
```

- [ ] **Step 3: Écrire `src/hooks/use-budget-mutations.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  create,
  remove,
  update,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from '@/data/budgets';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';

/**
 * Création, modification et suppression d'un budget.
 *
 * L'invalidation porte sur `queryKeys.budgets(groupId)` seule : la
 * consommation vient de `category_breakdown`, que ces mutations ne changent
 * pas — un plafond déplacé ne déplace aucune dépense.
 */
export function useBudgetMutations() {
  const queryClient = useQueryClient();
  const { activeGroupId } = useActiveGroup();

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.budgets(activeGroupId ?? ''),
    });
  }

  const createBudget = useMutation({
    mutationFn: (input: CreateBudgetInput) => create(input),
    onSuccess: invalidate,
  });

  const updateBudget = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateBudgetInput }) => update(id, patch),
    onSuccess: invalidate,
  });

  const deleteBudget = useMutation({
    mutationFn: (id: string) => remove(id),
    onSuccess: invalidate,
  });

  return {
    createBudget,
    updateBudget,
    deleteBudget,
    // Deux indicateurs distincts, comme pour les transactions : un seul
    // agrégé faisait tourner le bouton Supprimer pendant l'enregistrement.
    isSaving: createBudget.isPending || updateBudget.isPending,
    isDeleting: deleteBudget.isPending,
  };
}
```

- [ ] **Step 4: Vérifier**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-budgets.ts src/hooks/use-budget-progress.ts src/hooks/use-budget-mutations.ts
git commit -m "feat: hooks de lecture et de mutation des budgets"
```

---

## Task 5: Jeton `warning` et ligne de budget

**Files:**
- Modify: `src/theme/tokens.ts`
- Create: `src/components/budget/budget-row.tsx`

**Interfaces:**
- Consumes: `BudgetProgress`, `BudgetStatus` (Task 2) ; `formatAmount(value: number): string` de `@/lib/money` ; `categoryTone(category: { id: string; icon: string }, isDark: boolean): { tint: string; surface: string }` de `@/theme/category-colors`.
- Produces:
  ```ts
  // dans Colors
  warning: string;
  // composant
  export function BudgetRow({ item, onPress }: { item: BudgetProgress; onPress: () => void }): JSX.Element;
  ```

- [ ] **Step 1: Ajouter le jeton aux deux palettes**

Dans `src/theme/tokens.ts`, ajouter au type `Colors`, juste après `positive` :

```ts
  /** Avertissement : budget proche de son plafond. Sémantique, pas décoratif. */
  warning: string;
```

Puis dans `palette.light`, après `positive: '#0B8F6A',` :

```ts
    warning: '#B7791F',
```

Et dans `palette.dark`, après `positive: '#3DDC97',` :

```ts
    warning: '#F2B544',
```

- [ ] **Step 2: Écrire `src/components/budget/budget-row.tsx`**

```tsx
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatAmount } from '@/lib/money';
import type { BudgetProgress, BudgetStatus } from '@/lib/budget-progress';
import { categoryTone } from '@/theme/category-colors';
import { font, radius, spacing, useColors, useIsDark } from '@/theme/tokens';

/** Le texte dit ce que la couleur dit : un daltonien lit la même information. */
function statusText(item: BudgetProgress): string {
  if (item.status === 'over') {
    return `Dépassé de ${formatAmount(Math.abs(item.remaining))} €`;
  }
  return `Il reste ${formatAmount(item.remaining)} €`;
}

export function BudgetRow({
  item,
  onPress,
}: {
  item: BudgetProgress;
  onPress: () => void;
}) {
  const colors = useColors();
  const isDark = useIsDark();
  const tone = categoryTone(
    { id: item.budget.category.id, icon: item.budget.category.icon },
    isDark
  );

  const statusColor: Record<BudgetStatus, string> = {
    ok: colors.textMuted,
    warning: colors.warning,
    over: colors.danger,
  };

  // La piste garde la teinte de la catégorie, la barre prend celle du statut :
  // on reconnaît le poste à sa couleur habituelle et on lit l'alerte par-dessus.
  const barColor = item.status === 'ok' ? tone.tint : statusColor[item.status];
  const percent = Math.round(item.ratio * 100);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.budget.category.name}, ${formatAmount(item.spent)} euros sur ${formatAmount(Number(item.budget.amount))}, ${percent} %. ${statusText(item)}`}
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.head}>
        <View style={styles.identity}>
          <View style={[styles.dot, { backgroundColor: tone.surface }]}>
            <MaterialCommunityIcons
              // Le nom vient de la base ; @expo/vector-icons le type strictement.
              name={
                item.budget.category
                  .icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']
              }
              size={16}
              color={tone.tint}
            />
          </View>
          <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
            {item.budget.category.name}
          </Text>
        </View>
        <Text style={[styles.amounts, { color: colors.textMuted }]}>
          {formatAmount(item.spent)} / {formatAmount(Number(item.budget.amount))} €
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: tone.surface }]}>
        <View
          style={[
            styles.bar,
            // Plafonnée à 100 % de la piste, alors que le ratio, lui, reste
            // vrai : une barre qui déborderait de son conteneur ne se lirait
            // plus, mais le pourcentage annoncé doit rester exact.
            { width: `${Math.min(item.ratio * 100, 100)}%`, backgroundColor: barColor },
          ]}
        />
      </View>

      <Text style={[styles.status, { color: statusColor[item.status] }]}>
        {statusText(item)} · {percent} %
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // Cède au montant plutôt que de le pousser hors de l'écran à fort
    // grossissement de police.
    flexShrink: 1,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 14,
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  amounts: {
    fontFamily: font.bold,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: radius.pill,
  },
  status: {
    fontFamily: font.medium,
    fontSize: 12.5,
  },
});
```

- [ ] **Step 3: Vérifier**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/theme/tokens.ts src/components/budget/budget-row.tsx
git commit -m "feat: jeton warning et ligne de budget"
```

---

## Task 6: Écran 5

**Files:**
- Create: `src/app/(app)/budgets.tsx`
- Modify: `src/app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `useBudgetProgress()` (Task 4), `BudgetRow` (Task 5), `Screen` de `@/components/ui/screen` dont la signature est `Screen({ children, floatingAction, align }: { children: ReactNode; floatingAction?: ReactNode; align?: 'center' | 'top' })`, `dataErrorMessage` de `@/lib/data-errors`.
- Produces: la route `/budgets`.

**Pourquoi `Screen` et non `FlatList`** : l'historique évite `Screen` parce qu'une liste paginée imbriquée dans un `ScrollView` perd sa virtualisation. Ici la liste tient en quelques lignes et n'est pas paginée — la virtualisation ne sert à rien et `Screen` apporte le rythme vertical et le bouton flottant déjà réglés.

- [ ] **Step 1: Écrire l'écran**

```tsx
import { Link, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BudgetRow } from '@/components/budget/budget-row';
import { Screen } from '@/components/ui/screen';
import { useBudgetProgress } from '@/hooks/use-budget-progress';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

/**
 * Budgets par catégorie (spec 2.4, écran 5).
 *
 * La liste ne montre que les budgets définis : les quatorze catégories par
 * défaut afficheraient douze lignes vides pour deux utiles, et la progression
 * — le point de l'écran — se noierait. La découverte se fait dans le
 * formulaire de création, qui classe les catégories sans budget par dépense
 * réelle de la période.
 */
export default function BudgetsScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const router = useRouter();
  const { items, isLoading, error } = useBudgetProgress();

  return (
    <Screen
      align="top"
      floatingAction={
        <Link href="/budget" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter un budget"
            style={StyleSheet.flatten([
              styles.fab,
              elevation.floating,
              { backgroundColor: colors.primary },
            ])}
          >
            <Text style={[styles.fabLabel, { color: colors.primaryText }]}>+</Text>
          </Pressable>
        </Link>
      }
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={spacing.sm}
          onPress={() => router.back()}
        >
          <Text style={[styles.back, { color: colors.textMuted }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Budgets</Text>
      </View>

      {error ? (
        <Text style={[styles.message, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
      ) : isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : items.length === 0 ? (
        <Text style={[styles.message, { color: colors.textMuted }]}>
          Aucun budget défini. Touchez + pour fixer un plafond sur une catégorie.
        </Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <BudgetRow
              key={item.budget.id}
              item={item}
              onPress={() => router.push(`/budget?id=${item.budget.id}`)}
            />
          ))}
        </View>
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
  },
  list: {
    gap: spacing.sm + 2,
  },
  message: {
    fontFamily: font.regular,
    fontSize: 14,
    paddingVertical: spacing.lg,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: radius.lg + 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabLabel: {
    fontFamily: font.medium,
    fontSize: 30,
    lineHeight: 34,
  },
});
```

- [ ] **Step 2: Créer la route `budget` en ébauche**

`typedRoutes` est activé dans `app.json` : `<Link href="/budget">` ne type que si le fichier de route existe. Créer `src/app/(app)/budget.tsx` avec un contenu minimal, que la tâche 7 remplace entièrement :

```tsx
import { Text } from 'react-native';

/** Ébauche : remplacée par le formulaire à la tâche suivante. */
export default function BudgetScreen() {
  return <Text>Budget</Text>;
}
```

- [ ] **Step 3: Enregistrer les deux routes**

Dans `src/app/(app)/_layout.tsx`, dans le `<Stack>`, après `<Stack.Screen name="history" />` :

```tsx
      <Stack.Screen name="budgets" />
      <Stack.Screen
        name="budget"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
        }}
      />
```

- [ ] **Step 4: Vérifier**

```bash
npx tsc --noEmit
npm run lint
```

Si `tsc` refuse encore `href="/budget"`, c'est que les types de routes générés sont périmés : `npx expo start --clear` les régénère. Ne pas contourner par un cast.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/budgets.tsx" "src/app/(app)/_layout.tsx" "src/app/(app)/budget.tsx"
git commit -m "feat: ecran des budgets par categorie"
```

---

## Task 7: Formulaire de budget

**Files:**
- Create: `src/components/budget/budget-form.tsx`
- Modify (remplacer le fichier minimal de la tâche 6) : `src/app/(app)/budget.tsx`
- Modify: `src/lib/data-errors.ts`

**Interfaces:**
- Consumes: `useBudgets()`, `useBudgetMutations()` (Task 4) ; `useCategoryBreakdown()` ; `useCategories(type: TransactionType | null)` qui rend `{ categories: Category[], isLoading, error }` ; `AmountInput` de `@/components/transaction/amount-input` (props `{ value: string; onChangeText: (v: string) => void; autoFocus?: boolean }`) ; `CategoryPicker` de `@/components/transaction/category-picker` (props `{ categories: Category[]; selectedId: string | null; onSelect: (id: string) => void }`) ; `Button` de `@/components/ui/button` ; `parseAmount(input: string): number | null` de `@/lib/money`.
- Produces:
  ```ts
  export type BudgetFormValues = { categoryId: string; amount: number };
  export function BudgetForm(props: {
    availableCategories: Category[];
    initialValues?: BudgetFormValues;
    /** Verrouille le choix : on ne déplace pas un budget d'une catégorie à l'autre. */
    lockedCategory?: { id: string; name: string };
    submitLabel: string;
    submitting: boolean;
    deleting: boolean;
    errorText?: string;
    onSubmit: (values: BudgetFormValues) => void;
    onDelete?: () => void;
  }): JSX.Element;
  ```

**Décision d'interface :** en édition, la catégorie est **verrouillée**. Changer la catégorie d'un budget existant équivaut à supprimer l'un et créer l'autre, et se heurterait à la contrainte d'unicité si la cible en a déjà un. Supprimer puis recréer est explicite ; un sélecteur qui échoue une fois sur deux ne l'est pas.

- [ ] **Step 1: Corriger le message d'unicité**

Dans `src/lib/data-errors.ts`, remplacer la ligne `'23505': 'Cette opération existe déjà.',` par :

```ts
  // Formulation neutre : ce code sert désormais aux budgets, dont le triplet
  // (group_id, category_id, period) est unique. Les transactions, elles,
  // n'ont aucune contrainte d'unicité — ce message n'a jamais pu s'y afficher.
  '23505': 'Un enregistrement identique existe déjà.',
```

- [ ] **Step 2: Écrire `src/components/budget/budget-form.tsx`**

```tsx
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AmountInput } from '@/components/transaction/amount-input';
import { CategoryPicker } from '@/components/transaction/category-picker';
import { Button } from '@/components/ui/button';
import type { Category } from '@/data/categories';
import { parseAmount } from '@/lib/money';
import { font, spacing, useColors } from '@/theme/tokens';

export type BudgetFormValues = {
  categoryId: string;
  amount: number;
};

type BudgetFormProps = {
  /** Catégories proposées : à la création, celles sans budget, les plus dépensées d'abord. */
  availableCategories: Category[];
  initialValues?: BudgetFormValues;
  /** En édition, la catégorie ne se choisit plus : on affiche seulement son nom. */
  lockedCategory?: { id: string; name: string };
  submitLabel: string;
  submitting: boolean;
  deleting: boolean;
  errorText?: string;
  onSubmit: (values: BudgetFormValues) => void;
  onDelete?: () => void;
};

export function BudgetForm({
  availableCategories,
  initialValues,
  lockedCategory,
  submitLabel,
  submitting,
  deleting,
  errorText,
  onSubmit,
  onDelete,
}: BudgetFormProps) {
  const colors = useColors();

  const [categoryId, setCategoryId] = useState<string | null>(
    lockedCategory?.id ?? initialValues?.categoryId ?? null
  );
  const [amountText, setAmountText] = useState(
    initialValues ? initialValues.amount.toFixed(2).replace('.', ',') : ''
  );
  const [touched, setTouched] = useState(false);

  const amount = parseAmount(amountText);
  // `amount > 0` est une contrainte de la base : la refuser ici évite un
  // aller-retour réseau pour apprendre ce qu'on sait déjà.
  const valid = categoryId !== null && amount !== null && amount > 0;

  function handleSubmit() {
    setTouched(true);
    if (!valid) {
      return;
    }
    onSubmit({ categoryId: categoryId as string, amount: amount as number });
  }

  return (
    <View style={styles.form}>
      <AmountInput value={amountText} onChangeText={setAmountText} autoFocus />

      {lockedCategory ? (
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Catégorie</Text>
          <Text style={[styles.locked, { color: colors.text }]}>{lockedCategory.name}</Text>
          {/* Déplacer un budget d’une catégorie à l’autre reviendrait à en
              supprimer un et à en créer un autre, et buterait sur l’unicité si
              la cible en a déjà un. Supprimer puis recréer est explicite. */}
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Pour changer de catégorie, supprimez ce budget et créez-en un autre.
          </Text>
        </View>
      ) : (
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Catégorie</Text>
          {availableCategories.length === 0 ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              Toutes les catégories de dépense ont déjà un budget.
            </Text>
          ) : (
            <CategoryPicker
              categories={availableCategories}
              selectedId={categoryId}
              onSelect={setCategoryId}
            />
          )}
        </View>
      )}

      {touched && !valid ? (
        <Text style={[styles.error, { color: colors.danger }]}>
          Choisissez une catégorie et un montant supérieur à zéro.
        </Text>
      ) : null}

      {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

      <Button title={submitLabel} onPress={handleSubmit} loading={submitting} />

      {onDelete ? (
        <Button title="Supprimer" variant="ghost" onPress={onDelete} loading={deleting} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  block: {
    gap: spacing.sm,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 10.5,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
  },
  locked: {
    fontFamily: font.semibold,
    fontSize: 15,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 13,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 13,
  },
});
```

Signature de `Button`, vérifiée : `{ title: string; variant?: 'primary' | 'ghost' | 'danger'; loading?: boolean }` plus les props de `Pressable` (`onPress` comprise). Un bouton en `loading` est automatiquement désactivé.

- [ ] **Step 3: Écrire `src/app/(app)/budget.tsx`**

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { BudgetForm, type BudgetFormValues } from '@/components/budget/budget-form';
import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useBudgetMutations } from '@/hooks/use-budget-mutations';
import { useBudgets } from '@/hooks/use-budgets';
import { useCategories } from '@/hooks/use-categories';
import { useCategoryBreakdown } from '@/hooks/use-category-breakdown';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Une seule route pour les deux modes : création sans paramètre, édition avec
 * ?id=. Même parti que pour les transactions — le formulaire est écrit et
 * corrigé une seule fois.
 */
export default function BudgetScreen() {
  const colors = useColors();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { activeGroupId, isLoading: groupLoading, error: groupError } = useActiveGroup();
  const { budgets, isLoading: budgetsLoading } = useBudgets();
  const { categories } = useCategories('expense');
  const { slices } = useCategoryBreakdown();
  const { createBudget, updateBudget, deleteBudget, isSaving, isDeleting } = useBudgetMutations();
  const [errorText, setErrorText] = useState<string>();

  const existing = typeof id === 'string' ? budgets.find((budget) => budget.id === id) : undefined;

  /**
   * Catégories de dépense sans budget, les plus dépensées d'abord.
   *
   * C'est là que se fait la découverte : l'écran 5 ne liste que les budgets
   * définis, donc c'est au moment de choisir qu'on montre où l'argent part
   * vraiment. Une catégorie absente de la répartition n'a rien coûté sur la
   * période et se range après celles qui ont coûté.
   */
  const availableCategories = useMemo(() => {
    const budgeted = new Set(budgets.map((budget) => budget.category_id));
    const spentByCategory = new Map(slices.map((slice) => [slice.categoryId, slice.total]));

    return categories
      .filter((category) => !budgeted.has(category.id))
      .sort((a, b) => {
        const spentDelta =
          (spentByCategory.get(b.id) ?? 0) - (spentByCategory.get(a.id) ?? 0);
        return spentDelta !== 0 ? spentDelta : a.name.localeCompare(b.name, 'fr');
      });
  }, [budgets, categories, slices]);

  if (groupLoading || budgetsLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (groupError || !activeGroupId) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          {groupError ? dataErrorMessage(groupError) : 'Aucun groupe actif.'}
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  // Le budget visé n'est plus dans la liste : supprimé par un autre membre
  // pendant que la feuille était ouverte, ou identifiant périmé. Sans ce
  // garde, le formulaire s'ouvrirait vide sous le titre « Modifier » et
  // l'enregistrer créerait un doublon.
  if (typeof id === 'string' && !existing) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          Ce budget n’existe plus.
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  function handleSubmit(values: BudgetFormValues) {
    setErrorText(undefined);

    if (existing) {
      updateBudget.mutate(
        { id: existing.id, patch: { amount: values.amount } },
        {
          onSuccess: () => router.back(),
          onError: (error) => setErrorText(dataErrorMessage(error)),
        }
      );
      return;
    }

    createBudget.mutate(
      { groupId: activeGroupId as string, categoryId: values.categoryId, amount: values.amount },
      {
        onSuccess: () => router.back(),
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  function handleDelete() {
    if (!existing) {
      return;
    }
    deleteBudget.mutate(existing.id, {
      onSuccess: () => router.back(),
      onError: (error) => setErrorText(dataErrorMessage(error)),
    });
  }

  return (
    <View
      style={[
        styles.sheet,
        { backgroundColor: colors.background, maxHeight: windowHeight * 0.92 },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {existing ? 'Modifier le budget' : 'Nouveau budget'}
        </Text>
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

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <BudgetForm
          availableCategories={availableCategories}
          initialValues={
            existing
              ? { categoryId: existing.category_id, amount: Number(existing.amount) }
              : undefined
          }
          lockedCategory={
            existing
              ? { id: existing.category.id, name: existing.category.name }
              : undefined
          }
          submitLabel={existing ? 'Enregistrer' : 'Ajouter'}
          submitting={isSaving}
          deleting={isDeleting}
          errorText={errorText}
          onSubmit={handleSubmit}
          onDelete={existing ? handleDelete : undefined}
        />
      </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
  },
  centered: {
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

- [ ] **Step 4: Vérifier**

```bash
npx tsc --noEmit
npm run lint
npm test
```

Le lint compte autant que `tsc` : `react/no-unescaped-entities` échoue sur une apostrophe droite dans du JSX. Les apostrophes typographiques `’` du code ci-dessus sont voulues.

- [ ] **Step 5: Commit**

```bash
git add src/components/budget/budget-form.tsx "src/app/(app)/budget.tsx" src/lib/data-errors.ts
git commit -m "feat: formulaire de creation et de modification d'un budget"
```

---

## Task 8: Ligne du tableau de bord

**Files:**
- Create: `src/components/dashboard/budgets-entry.tsx`
- Modify: `src/app/(app)/index.tsx`

**Interfaces:**
- Consumes: `useBudgetProgress()` (Task 4), le jeton `colors.warning` (Task 5), la route `/budgets` (Task 6).
- Produces: `export function BudgetsEntry(): JSX.Element | null;`

**Rôle double, assumé :** l'app n'a ni barre d'onglets ni écran de paramètres. Un bandeau qui ne s'affiche qu'en alerte laisserait l'écran 5 sans point d'entrée le reste du temps. La même ligne porte donc les deux rôles, et son apparence monte d'un cran en cas d'alerte — l'escalade se remarque parce que la place, elle, ne bouge pas.

- [ ] **Step 1: Écrire le composant**

```tsx
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useBudgetProgress } from '@/hooks/use-budget-progress';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/**
 * Résume l'état des budgets en une phrase.
 *
 * Le compte des dépassements passe avant celui des alertes : c'est
 * l'information qui appelle une action.
 */
function summarise(over: number, warning: number, total: number): string {
  if (total === 0) {
    return 'À définir';
  }
  if (over === 0 && warning === 0) {
    return total === 1 ? '1 budget suivi' : `${total} budgets suivis`;
  }

  const parts: string[] = [];
  if (over > 0) {
    parts.push(over === 1 ? '1 dépassé' : `${over} dépassés`);
  }
  if (warning > 0) {
    parts.push(warning === 1 ? '1 proche de la limite' : `${warning} proches de la limite`);
  }
  return parts.join(', ');
}

export function BudgetsEntry() {
  const colors = useColors();
  const { items, isLoading, error } = useBudgetProgress();

  // Ni squelette ni message d'erreur : cette ligne est d'abord un point
  // d'entrée. Un budget dont l'état est inconnu se rejoint quand même, et un
  // bandeau d'erreur de plus sur le tableau de bord n'apprendrait rien que la
  // carte de résumé ne dise déjà.
  const over = items.filter((item) => item.status === 'over').length;
  const warning = items.filter((item) => item.status === 'warning').length;

  const accent = over > 0 ? colors.danger : warning > 0 ? colors.warning : colors.textMuted;
  const detail =
    isLoading || error ? 'Voir' : summarise(over, warning, items.length);

  return (
    <Link href="/budgets" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Budgets. ${detail}`}
        style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.left}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={[styles.label, { color: colors.text }]}>Budgets</Text>
        </View>
        <View style={styles.right}>
          <Text numberOfLines={1} style={[styles.detail, { color: accent }]}>
            {detail}
          </Text>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    // Cède avant le libellé quand la police grossit.
    flexShrink: 1,
  },
  detail: {
    fontFamily: font.medium,
    fontSize: 13,
    flexShrink: 1,
  },
  chevron: {
    fontFamily: font.semibold,
    fontSize: 18,
    flexShrink: 0,
  },
});
```

- [ ] **Step 2: Monter la ligne sur le tableau de bord**

Dans `src/app/(app)/index.tsx`, ajouter l'import :

```tsx
import { BudgetsEntry } from '@/components/dashboard/budgets-entry';
```

et placer `<BudgetsEntry />` juste après `<CategoryBreakdown />`, avant le bloc `<View style={styles.sectionRow}>` des dernières opérations. La répartition dit où l'argent part, les budgets disent jusqu'où il peut partir : les deux se lisent l'un après l'autre.

- [ ] **Step 3: Vérifier**

```bash
npx tsc --noEmit
npm run lint
npx expo export --platform android --output-dir "$TEMP/wazu-bundle-check"
```

Le bundle doit se construire : c'est ce qui attrape un import circulaire ou un chemin de route invalide, que `tsc` laisse passer.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/budgets-entry.tsx "src/app/(app)/index.tsx"
git commit -m "feat: acces aux budgets et alerte depuis le tableau de bord"
```

---

## Task 9: Temps réel et documentation

**Files:**
- Create: `src/hooks/use-budgets-realtime.ts`
- Modify: `src/app/(app)/_layout.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `queryKeys.budgets` (Task 1), `useActiveGroup()`, `supabase`.
- Produces: `export function useBudgetsRealtime(): void;`

**Pourquoi un hook séparé de `useTransactionsRealtime`** : un canal, une préoccupation. Le hook des transactions porte déjà un long raisonnement sur les DELETE qu'il ne faut pas emmêler avec un second sujet.

- [ ] **Step 1: Écrire le hook**

```ts
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/**
 * Sync temps réel des budgets du groupe actif (spec 4.2) : un plafond posé par
 * un membre apparaît chez l'autre sans recharger l'app.
 *
 * Les policies RLS s'appliquent aussi aux messages Realtime — un abonné ne
 * reçoit que ce qu'il a le droit de lire. Le filtre serveur ci-dessous n'est
 * donc pas une mesure de sécurité, seulement une économie de trafic.
 */
export function useBudgetsRealtime(): void {
  const queryClient = useQueryClient();
  const { activeGroupId } = useActiveGroup();

  useEffect(() => {
    if (!activeGroupId) {
      return;
    }

    function invalidate() {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.budgets(activeGroupId as string),
      });
    }

    const channel = supabase
      .channel(`budgets:${activeGroupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budgets',
          filter: `group_id=eq.${activeGroupId}`,
        },
        invalidate
      )
      // Second abonnement DELETE sans filtre serveur, pour la même raison que
      // dans use-transactions-realtime : `replica identity` n'est pas complète
      // (choix délibéré — Supabase n'applique pas RLS aux événements DELETE,
      // donc une identité complète diffuserait la ligne entière). L'ancien
      // tuple ne porte donc que la clé primaire, sans `group_id`, et le filtre
      // ci-dessus ne peut jamais correspondre à une suppression. Cet
      // abonnement-ci ne reçoit que des identifiants et se contente
      // d'invalider. Ne pas le fusionner avec celui du dessus : ça
      // réintroduirait le bug (en gardant le filtre) ou la fuite (en posant
      // l'identité complète).
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'budgets' },
        invalidate
      )
      .subscribe((status) => {
        // SUBSCRIBED se déclenche à la connexion initiale comme après une
        // reconnexion : invalider là rattrape ce qui a changé pendant le trou.
        if (status === 'SUBSCRIBED') {
          invalidate();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeGroupId, queryClient]);
}
```

- [ ] **Step 2: Monter le hook**

Dans `src/app/(app)/_layout.tsx`, dans le composant `AppStack`, sous `useTransactionsRealtime();` :

```tsx
  useBudgetsRealtime();
```

avec l'import correspondant. `AppStack` est déjà le composant monté **sous** `ActiveGroupProvider` — c'est la raison de son existence, et le hook a besoin du contexte.

- [ ] **Step 3: Écrire les règles acquises dans `CLAUDE.md`**

Dans la section « Data access layers », après le paragraphe sur `category_breakdown` :

```markdown
Budgets read through `category_breakdown` rather than their own aggregate: the
RPC already defines "spend for the period", and a second definition alongside
it would be one more thing to keep in agreement. The client only matches by
`category_id` and divides — the summation stays in Postgres. `budget-progress.ts`
holds the thresholds and the sort order, so they are covered by Jest rather
than buried in JSX.

`queryKeys.budgets(groupId)` sits outside `['transactions']`, unlike
`periodSummary` and `categoryBreakdown`. Those derive from transactions and must
ride their invalidations; a ceiling does not, and nesting it would reload every
budget on each expense entry.
```

- [ ] **Step 4: Vérifier l'ensemble**

```bash
npx tsc --noEmit
npm run lint
npm test
npm run test:db
npx expo export --platform android --output-dir "$TEMP/wazu-bundle-check"
```

Attendu : aucune erreur, 56 tests Jest, 55 assertions pgTAP, bundle construit.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-budgets-realtime.ts "src/app/(app)/_layout.tsx" CLAUDE.md
git commit -m "feat: sync temps reel des budgets"
```

---

## Vérification manuelle (après la tâche 9)

Aucun composant ni hook n'a de test JS dans ce projet et il n'existe pas de double de Supabase : ces points ne sont couverts que manuellement.

1. **Aucun budget** — le tableau de bord montre « Budgets · À définir ». L'écran 5 propose son état vide.
2. **Création** — le sélecteur ne propose que des catégories de dépense, sans budget, la plus dépensée en tête. Ajouter un plafond très supérieur à la dépense : ligne verte, « Il reste … ».
3. **Seuil d'alerte** — poser un plafond juste au-dessus de la dépense réelle d'une catégorie pour franchir 80 % : la barre passe en ambre, le dashboard affiche « 1 proche de la limite ».
4. **Dépassement** — poser un plafond inférieur à la dépense : barre rouge pleine, « Dépassé de … », pourcentage supérieur à 100, et la ligne remonte en tête de liste.
5. **Édition** — rouvrir un budget : la catégorie s'affiche verrouillée, seul le montant se change.
6. **Suppression** — le budget disparaît de la liste et le compte du dashboard se met à jour.
7. **Doublon** — impossible par le sélecteur ; le vérifier en gardant deux appareils ouverts sur la même création, ou l'admettre comme couvert par le test pgTAP.
8. **Échelle de police à 200 %** — sur l'écran 5 et dans la feuille : aucun libellé tronqué, aucun montant poussé hors de l'écran.
9. **Thème sombre** — jeton `warning` lisible sur fond profond.
