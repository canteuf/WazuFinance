# Historique des transactions — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter l'écran 3 — la liste paginée de toutes les opérations du groupe actif, filtrable par période, catégorie et type.

**Architecture:** Pagination par curseur sur `(occurred_on, id)` avec `useInfiniteQuery`, sur l'index `transactions_group_occurred_idx` existant. La clé de cache s'imbrique sous `['transactions']` pour hériter des invalidations déjà posées par les mutations et le Realtime. L'écran monte une `FlatList` directement, sans le composant `Screen`, dont le `ScrollView` désactiverait la virtualisation.

**Tech Stack:** React Native 0.86, Expo SDK 57, expo-router v6, TanStack Query v5, Supabase (PostgREST), TypeScript strict, Jest (jest-expo), pgTAP.

**Spec:** [docs/superpowers/specs/2026-09-08-historique-transactions-design.md](../specs/2026-09-08-historique-transactions-design.md)

## Global Constraints

- TypeScript strict, aucun `any`.
- Chaînes visibles en français, identifiants de code en anglais. Commentaires SQL en français.
- Noms de fichiers en kebab-case, composants en PascalCase.
- Aucun `fontWeight` : la famille porte la graisse, via les constantes `font.*` de `src/theme/tokens.ts`.
- Aucune couleur en dur : tout passe par `useColors()` / `useElevation()`.
- Dépendances one-way : `screens → hooks → src/data/ → supabase`. Un écran n'importe jamais `supabase` ; `src/data/` n'importe jamais React.
- Les erreurs de données sont traduites par `dataErrorMessage()` de `src/lib/data-errors.ts`.
- L'échelle de police système est suivie, jamais plafonnée : les conteneurs s'élargissent ou se réagencent au-delà de `stackAtFontScale`.
- **Aucune migration dans ce plan.** Rien à pousser en base.
- Commandes de vérification : `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run test:db`.
- `npm run test:db` exige Docker Desktop lancé, `npx supabase start`, puis **`npx supabase db reset`** — sans le reset, la base locale repart d'une sauvegarde et les migrations récentes ne sont pas appliquées.

---

### Task 1: Préréglages de période

**Files:**
- Modify: `src/lib/dates.ts`
- Test: `src/lib/dates.test.ts`

**Interfaces:**
- Consumes: `periodBounds(today: string, startDay: number): { from: string; to: string }`, `isoToDate`, `dateToIso` — tous déjà dans `src/lib/dates.ts`.
- Produces: `type PeriodPresetId = 'current' | 'previous' | 'last3' | 'all'`, `type PeriodPreset = { id: PeriodPresetId; label: string; from: string | null; to: string | null }`, `periodPresets(today: string, startDay: number): PeriodPreset[]`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `src/lib/dates.test.ts`, et compléter l'import existant en tête de fichier pour y ajouter `periodPresets` :

```ts
describe('periodPresets', () => {
  it('cale les quatre préréglages sur un mois calendaire', () => {
    const presets = periodPresets('2026-09-08', 1);
    expect(presets.map((preset) => preset.id)).toEqual([
      'current',
      'previous',
      'last3',
      'all',
    ]);
    expect(presets[0]).toEqual({
      id: 'current',
      label: 'En cours',
      from: '2026-09-01',
      to: '2026-10-01',
    });
    expect(presets[1]).toEqual({
      id: 'previous',
      label: 'Précédente',
      from: '2026-08-01',
      to: '2026-09-01',
    });
  });

  // Trois périodes, donc deux crans en arrière depuis le début de la période
  // en cours, et la même borne haute qu'elle.
  it('couvre trois périodes entières sur « 3 dernières »', () => {
    const presets = periodPresets('2026-09-08', 1);
    expect(presets[2]).toEqual({
      id: 'last3',
      label: '3 dernières',
      from: '2026-07-01',
      to: '2026-10-01',
    });
  });

  // « Tout » ne borne rien : c'est ce qui distingue null d'une date.
  it('ne borne pas « Tout »', () => {
    const presets = periodPresets('2026-09-08', 1);
    expect(presets[3]).toEqual({ id: 'all', label: 'Tout', from: null, to: null });
  });

  it('recule d’une année sur la période précédente en début janvier', () => {
    const presets = periodPresets('2027-01-04', 15);
    expect(presets[0].from).toBe('2026-12-15');
    expect(presets[1].from).toBe('2026-11-15');
    expect(presets[1].to).toBe('2026-12-15');
  });

  // Le plafond de 28 en base garantit que reculer de deux mois ne rencontre
  // jamais un mois trop court : février a toujours au moins 28 jours.
  it('tient au jour de démarrage 28 en traversant février', () => {
    const presets = periodPresets('2026-03-01', 28);
    expect(presets[0].from).toBe('2026-02-28');
    expect(presets[2].from).toBe('2025-12-28');
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- dates`
Expected: FAIL — `periodPresets is not a function` (l'import ne résout rien).

- [ ] **Step 3: Écrire l'implémentation minimale**

Ajouter à la fin de `src/lib/dates.ts` :

```ts
export type PeriodPresetId = 'current' | 'previous' | 'last3' | 'all';

export type PeriodPreset = {
  id: PeriodPresetId;
  label: string;
  /** null aux deux bornes = aucune limite de date. */
  from: string | null;
  to: string | null;
};

/**
 * Les quatre choix du filtre de période de l'écran 3.
 *
 * Tous calés sur `periodBounds`, donc sur `budget_groups.period_start_day` :
 * « En cours » recouvre exactement les lignes que le solde du tableau de bord
 * additionne. Des préréglages calendaires afficheraient une somme différente
 * dès que le jour de démarrage n'est pas le 1er, sans que rien n'explique
 * l'écart.
 */
export function periodPresets(today: string, startDay: number): PeriodPreset[] {
  const current = periodBounds(today, startDay);

  // La veille du début de la période en cours tombe forcément dans la
  // précédente : on relit les bornes depuis cette date plutôt que de refaire
  // l'arithmétique des mois une seconde fois.
  const dayBefore = isoToDate(current.from);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const previous = periodBounds(dateToIso(dayBefore), startDay);

  // Deux crans en arrière depuis le début de la période en cours en couvre
  // trois avec elle. setMonth est sûr ici : le jour de démarrage est plafonné
  // à 28 en base, et aucun mois n'a moins de 28 jours.
  const thirdBack = isoToDate(current.from);
  thirdBack.setMonth(thirdBack.getMonth() - 2);

  return [
    { id: 'current', label: 'En cours', from: current.from, to: current.to },
    { id: 'previous', label: 'Précédente', from: previous.from, to: previous.to },
    { id: 'last3', label: '3 dernières', from: dateToIso(thirdBack), to: current.to },
    { id: 'all', label: 'Tout', from: null, to: null },
  ];
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- dates`
Expected: PASS, tous les tests du fichier.

- [ ] **Step 5: Vérifier le typage et le lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dates.ts src/lib/dates.test.ts
git commit -m "feat: prereglages de periode pour le filtre de l'historique"
```

---

### Task 2: Test pgTAP de l'invariant de pagination

**Files:**
- Create: `supabase/tests/transaction_paging_test.sql`

**Interfaces:**
- Consumes: le schéma existant (`public.transactions`, `public.budget_groups`, `public.account_memberships`, `public.categories`) et l'index `transactions_group_occurred_idx`.
- Produces: rien pour les autres tâches. Ce test fixe le contrat que la Task 3 doit reproduire côté client.

Ce test ne teste pas du code applicatif : il fixe l'invariant que le prédicat de curseur doit tenir. C'est le seul endroit où un défaut de pagination se manifeste, et il doit exister **avant** que la Task 3 encode ce prédicat en TypeScript.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `supabase/tests/transaction_paging_test.sql` :

```sql
-- Invariant de la pagination par curseur de l'écran 3.
--
-- La pagination porte sur le couple (occurred_on, id) et non sur un décalage :
-- entre deux pages, une insertion décalerait toutes les suivantes et ferait
-- apparaître une ligne deux fois, une suppression en sauterait une.
--
-- Les fixtures contiennent volontairement deux lignes à la même date. C'est le
-- seul cas où le départage par id compte, et donc le seul où un défaut se voit.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(4);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contournée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'alice@example.com', '{"display_name": "Alice"}'::jsonb);

insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000b9', 'Colocation',
        '00000000-0000-0000-0000-0000000000b1', false);

insert into public.account_memberships (group_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000b9',
        '00000000-0000-0000-0000-0000000000b1', 'owner');

-- Ordre attendu, par (occurred_on desc, id desc) :
--   ab01 (09-10), ab03 (09-08), ab02 (09-08), ab04 (09-05), ab05 (09-01)
-- ab03 précède ab02 : même date, id supérieur.
insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on) values
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-0000000000b9',
   '00000000-0000-0000-0000-0000000000b1',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 10.00, '2026-09-10'),
  ('00000000-0000-0000-0000-00000000ab02', '00000000-0000-0000-0000-0000000000b9',
   '00000000-0000-0000-0000-0000000000b1',
   (select id from public.categories where group_id is null and name = 'Alimentation'),
   'expense', 20.00, '2026-09-08'),
  ('00000000-0000-0000-0000-00000000ab03', '00000000-0000-0000-0000-0000000000b9',
   '00000000-0000-0000-0000-0000000000b1',
   (select id from public.categories where group_id is null and name = 'Transport'),
   'expense', 30.00, '2026-09-08'),
  ('00000000-0000-0000-0000-00000000ab04', '00000000-0000-0000-0000-0000000000b9',
   '00000000-0000-0000-0000-0000000000b1',
   (select id from public.categories where group_id is null and name = 'Logement'),
   'expense', 40.00, '2026-09-05'),
  ('00000000-0000-0000-0000-00000000ab05', '00000000-0000-0000-0000-0000000000b9',
   '00000000-0000-0000-0000-0000000000b1',
   (select id from public.categories where group_id is null and name = 'Salaire'),
   'income', 50.00, '2026-09-01');

-- ---------------------------------------------------------------------------
-- Page 1 : aucun curseur
-- ---------------------------------------------------------------------------

SELECT is(
  (select array_agg(id order by occurred_on desc, id desc)
     from (select id, occurred_on from public.transactions
            where group_id = '00000000-0000-0000-0000-0000000000b9'
            order by occurred_on desc, id desc
            limit 2) as page),
  ARRAY['00000000-0000-0000-0000-00000000ab01',
        '00000000-0000-0000-0000-00000000ab03']::uuid[],
  'La première page rend les deux lignes les plus récentes, id décroissant à date égale'
);

-- ---------------------------------------------------------------------------
-- Page 2 : curseur sur la dernière ligne de la page 1, soit (09-08, ab03)
-- ---------------------------------------------------------------------------

-- C'est ici que le départage compte : ab02 partage sa date avec le curseur et
-- doit malgré tout être renvoyée, parce que son id lui est inférieur.
SELECT is(
  (select array_agg(id order by occurred_on desc, id desc)
     from (select id, occurred_on from public.transactions
            where group_id = '00000000-0000-0000-0000-0000000000b9'
              and (occurred_on, id) < ('2026-09-08'::date,
                                       '00000000-0000-0000-0000-00000000ab03'::uuid)
            order by occurred_on desc, id desc
            limit 2) as page),
  ARRAY['00000000-0000-0000-0000-00000000ab02',
        '00000000-0000-0000-0000-00000000ab04']::uuid[],
  'La deuxième page reprend à la ligne suivante, sans répéter ni sauter la date partagée'
);

-- ---------------------------------------------------------------------------
-- Page 3 : curseur (09-05, ab04). Plus courte que la limite : c'est la fin.
-- ---------------------------------------------------------------------------

SELECT is(
  (select array_agg(id order by occurred_on desc, id desc)
     from (select id, occurred_on from public.transactions
            where group_id = '00000000-0000-0000-0000-0000000000b9'
              and (occurred_on, id) < ('2026-09-05'::date,
                                       '00000000-0000-0000-0000-00000000ab04'::uuid)
            order by occurred_on desc, id desc
            limit 2) as page),
  ARRAY['00000000-0000-0000-0000-00000000ab05']::uuid[],
  'La dernière page est plus courte que la limite demandée'
);

-- ---------------------------------------------------------------------------
-- La réunion des trois pages, dans l'ordre de parcours : les cinq lignes, une
-- seule fois chacune. C'est l'assertion qui prouve réellement l'absence de
-- doublon et de trou — compter les lignes de la table ne prouverait rien.
-- ---------------------------------------------------------------------------

WITH page1 AS (
  select id, occurred_on, 1 as page from public.transactions
   where group_id = '00000000-0000-0000-0000-0000000000b9'
   order by occurred_on desc, id desc
   limit 2
), page2 AS (
  select id, occurred_on, 2 as page from public.transactions
   where group_id = '00000000-0000-0000-0000-0000000000b9'
     and (occurred_on, id) < ('2026-09-08'::date,
                              '00000000-0000-0000-0000-00000000ab03'::uuid)
   order by occurred_on desc, id desc
   limit 2
), page3 AS (
  select id, occurred_on, 3 as page from public.transactions
   where group_id = '00000000-0000-0000-0000-0000000000b9'
     and (occurred_on, id) < ('2026-09-05'::date,
                              '00000000-0000-0000-0000-00000000ab04'::uuid)
   order by occurred_on desc, id desc
   limit 2
), parcours AS (
  select * from page1
  union all select * from page2
  union all select * from page3
)
SELECT is(
  (select array_agg(id order by page, occurred_on desc, id desc) from parcours),
  ARRAY['00000000-0000-0000-0000-00000000ab01',
        '00000000-0000-0000-0000-00000000ab03',
        '00000000-0000-0000-0000-00000000ab02',
        '00000000-0000-0000-0000-00000000ab04',
        '00000000-0000-0000-0000-00000000ab05']::uuid[],
  'Le parcours des trois pages rend les cinq lignes dans l''ordre, sans doublon ni trou'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Lancer la base locale et le test**

```bash
npx supabase start
npx supabase db reset
npm run test:db
```

Expected: `transaction_paging_test.sql ... ok`, et le total passe de 39 à 43 assertions.

Si le test échoue sur `function ... does not exist` ou sur une colonne inconnue, c'est que `db reset` n'a pas été lancé : la base locale repart d'une sauvegarde et n'a pas les migrations récentes.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/transaction_paging_test.sql
git commit -m "test: invariant de la pagination par curseur sur date partagee"
```

---

### Task 3: Lecture paginée et filtrée

**Files:**
- Modify: `src/data/transactions.ts`
- Modify: `src/lib/query-keys.ts`

**Interfaces:**
- Consumes: `supabase` de `@/lib/supabase`, `SELECT_WITH_CATEGORY` et `TransactionWithCategory` déjà dans `src/data/transactions.ts`.
- Produces: `type TransactionFilters = { from: string | null; to: string | null; categoryId: string | null; type: Tables<'transactions'>['type'] | null }`, `type TransactionCursor = { occurredOn: string; id: string }`, `listPage(groupId: string, filters: TransactionFilters, cursor: TransactionCursor | null, limit: number): Promise<TransactionWithCategory[]>`, et `queryKeys.transactionHistory(groupId: string, filters: TransactionFilters)`.

Il n'y a pas de test JS possible ici : ce projet n'a aucun double de Supabase, et `npm test` ne couvre que les modules sans dépendance. L'invariant est déjà prouvé par la Task 2 ; cette tâche se contente de le reproduire fidèlement, et sa vérification est le typage, le lint, puis l'écran une fois la Task 7 posée.

- [ ] **Step 1: Ajouter les types et la fonction de lecture**

Ajouter à la fin de `src/data/transactions.ts` :

```ts
export type TransactionFilters = {
  /** Bornes de date, `null` des deux côtés pour « Tout ». */
  from: string | null;
  to: string | null;
  categoryId: string | null;
  type: Tables<'transactions'>['type'] | null;
};

/** Dernière ligne rendue par la page précédente. */
export type TransactionCursor = {
  occurredOn: string;
  id: string;
};

/**
 * Une page de l'historique, les plus récentes d'abord.
 *
 * La pagination porte sur le couple `(occurred_on, id)` et non sur un décalage.
 * Avec `.range()`, une insertion entre deux pages décale toutes les suivantes
 * et fait apparaître une ligne deux fois ; une suppression en saute une. Le
 * Realtime insérant pendant le défilement, ce n'est pas une hypothèse.
 *
 * L'invariant est couvert par supabase/tests/transaction_paging_test.sql, dont
 * les fixtures partagent volontairement une date : c'est le seul cas où le
 * départage par `id` compte.
 */
export async function listPage(
  groupId: string,
  filters: TransactionFilters,
  cursor: TransactionCursor | null,
  limit: number
): Promise<TransactionWithCategory[]> {
  let query = supabase
    .from('transactions')
    .select(SELECT_WITH_CATEGORY)
    .eq('group_id', groupId);

  // Bornes semi-ouvertes, comme period_summary : la borne haute est exclue,
  // ce qui supprime la classe de bugs « 30 ou 31 jours ».
  if (filters.from !== null) {
    query = query.gte('occurred_on', filters.from);
  }
  if (filters.to !== null) {
    query = query.lt('occurred_on', filters.to);
  }
  if (filters.categoryId !== null) {
    query = query.eq('category_id', filters.categoryId);
  }
  if (filters.type !== null) {
    query = query.eq('type', filters.type);
  }

  if (cursor !== null) {
    // PostgREST n'exprime pas la comparaison de couples `(a, b) < (c, d)` :
    // ce `or` produit le même prédicat. Les deux valeurs viennent d'une ligne
    // déjà renvoyée par le serveur, jamais d'une saisie.
    query = query.or(
      `occurred_on.lt.${cursor.occurredOn},` +
        `and(occurred_on.eq.${cursor.occurredOn},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query
    .order('occurred_on', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data;
}
```

- [ ] **Step 2: Ajouter la clé de cache**

Dans `src/lib/query-keys.ts`, ajouter l'import de type en tête de fichier :

```ts
// Import de type seulement : aucune dépendance à l'exécution, donc le sens des
// couches (data → lib) reste intact.
import type { TransactionFilters } from '@/data/transactions';
```

puis, dans l'objet `queryKeys`, juste après `periodSummary` :

```ts
  // Imbriquée sous ['transactions'] comme periodSummary : elle hérite des
  // invalidations posées par les mutations et le Realtime. Les filtres entrent
  // dans la clé, donc changer de filtre ouvre une entrée neuve au lieu
  // d'écraser la précédente — revenir à un filtre déjà vu est immédiat.
  transactionHistory: (groupId: string, filters: TransactionFilters) =>
    ['transactions', 'history', groupId, filters] as const,
```

- [ ] **Step 3: Vérifier le typage et le lint**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: aucune erreur, et les tests Jest existants passent toujours.

- [ ] **Step 4: Commit**

```bash
git add src/data/transactions.ts src/lib/query-keys.ts
git commit -m "feat: lecture paginee et filtree de l'historique"
```

---

### Task 4: Hook d'historique

**Files:**
- Create: `src/hooks/use-transaction-history.ts`

**Interfaces:**
- Consumes: `listPage`, `TransactionFilters`, `TransactionCursor`, `TransactionWithCategory` de `@/data/transactions` ; `queryKeys.transactionHistory` ; `useActiveGroup` de `@/hooks/use-active-group`.
- Produces: `HISTORY_PAGE_SIZE` (nombre), et `useTransactionHistory(filters: TransactionFilters)` renvoyant `{ transactions, isLoading, error, isEmptyError, hasNextPage, isFetchingNextPage, loadMore, retry }`.

- [ ] **Step 1: Écrire le hook**

Créer `src/hooks/use-transaction-history.ts` :

```ts
import { useInfiniteQuery } from '@tanstack/react-query';

import {
  listPage,
  type TransactionCursor,
  type TransactionFilters,
  type TransactionWithCategory,
} from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';

/** Lignes par page. Assez pour remplir un écran haut sans le charger d'un coup. */
export const HISTORY_PAGE_SIZE = 20;

export function useTransactionHistory(filters: TransactionFilters): {
  transactions: TransactionWithCategory[];
  isLoading: boolean;
  error: unknown;
  /** Vrai quand l'échec porte sur la première page : rien n'est affichable. */
  isEmptyError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  loadMore: () => void;
  retry: () => void;
} {
  const { activeGroupId } = useActiveGroup();

  const query = useInfiniteQuery({
    queryKey: queryKeys.transactionHistory(activeGroupId ?? '', filters),
    queryFn: ({ pageParam }) =>
      listPage(activeGroupId as string, filters, pageParam, HISTORY_PAGE_SIZE),
    initialPageParam: null as TransactionCursor | null,
    getNextPageParam: (lastPage): TransactionCursor | null => {
      // Une page plus courte que demandée est forcément la dernière : inutile
      // d'aller chercher une page vide pour s'en apercevoir.
      if (lastPage.length < HISTORY_PAGE_SIZE) {
        return null;
      }
      const last = lastPage[lastPage.length - 1];
      return { occurredOn: last.occurred_on, id: last.id };
    },
    enabled: activeGroupId !== null,
  });

  const transactions = query.data?.pages.flat() ?? [];

  return {
    transactions,
    isLoading: query.isLoading,
    error: query.error,
    // On distingue les deux échecs par ce qui est déjà affiché plutôt que par
    // un drapeau de TanStack : effacer trente lignes chargées parce que la
    // trente-et-unième n'est pas venue serait une régression.
    isEmptyError: query.isError && transactions.length === 0,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore: () => {
      // Sans ce garde, chaque frôlement du bas relancerait une requête déjà
      // en vol.
      if (query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    },
    retry: () => {
      void query.refetch();
    },
  };
}
```

- [ ] **Step 2: Vérifier le typage et le lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-transaction-history.ts
git commit -m "feat: hook d'historique pagine"
```

---

### Task 5: Ligne d'opération partagée

**Files:**
- Create: `src/components/transaction/transaction-row.tsx`
- Modify: `src/components/dashboard/recent-transactions.tsx`

**Interfaces:**
- Consumes: `TransactionWithCategory` de `@/data/transactions`, `categoryTone` de `@/theme/category-colors`, `formatOccurredOn` de `@/lib/dates`, `formatSigned` de `@/lib/money`, les jetons de `@/theme/tokens`.
- Produces: `TransactionRow({ transaction }: { transaction: TransactionWithCategory })`.

Le contenu déplacé existe déjà dans `recent-transactions.tsx` : cette tâche l'extrait sans en changer le rendu, pour que l'écran 3 affiche exactement les mêmes lignes que le tableau de bord.

- [ ] **Step 1: Créer le composant partagé**

Créer `src/components/transaction/transaction-row.tsx` :

```tsx
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { TransactionWithCategory } from '@/data/transactions';
import { formatOccurredOn } from '@/lib/dates';
import { formatSigned } from '@/lib/money';
import { categoryTone } from '@/theme/category-colors';
import {
  font,
  radius,
  spacing,
  stackAtFontScale,
  useColors,
  useElevation,
  useIsDark,
} from '@/theme/tokens';

/**
 * Une opération dans une liste, sur le tableau de bord comme dans
 * l'historique. Partagée pour que l'empilement à forte échelle de police
 * n'existe qu'à un seul endroit.
 */
export function TransactionRow({ transaction }: { transaction: TransactionWithCategory }) {
  const colors = useColors();
  const elevation = useElevation();
  const isDark = useIsDark();
  const { fontScale } = useWindowDimensions();

  // Au-delà du seuil, le montant passe sous le nom plutôt que de l'écraser.
  const stacked = fontScale >= stackAtFontScale;

  const icon = transaction.category?.icon ?? 'tag';
  const tone = categoryTone({ id: transaction.category_id ?? transaction.id, icon }, isDark);

  // « Carrefour · aujourd'hui », ou la seule date quand il n'y a pas de note.
  // Sans la date, deux lignes de la même catégorie sont indiscernables.
  const meta = [transaction.note, formatOccurredOn(transaction.occurred_on)]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  // Même nœud dans les deux dispositions : sous le nom quand on empile, en
  // bout de ligne sinon.
  const amount = (
    <Text
      style={[
        styles.amount,
        stacked && styles.amountStacked,
        { color: transaction.type === 'income' ? colors.positive : colors.text },
      ]}
    >
      {formatSigned(Number(transaction.amount), transaction.type)}
    </Text>
  );

  return (
    <Link href={`/transaction?id=${transaction.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Modifier ${transaction.category?.name ?? 'opération'}`}
        // Aplati : <Link asChild> transmet le style à son enfant et avertit
        // s'il reçoit un tableau.
        style={StyleSheet.flatten([
          styles.row,
          stacked && styles.rowStacked,
          elevation.card,
          { backgroundColor: colors.surface },
        ])}
      >
        <View style={[styles.glyph, { backgroundColor: tone.surface }]}>
          <MaterialCommunityIcons
            // Le nom vient de la base ; @expo/vector-icons le type de façon
            // stricte, d'où la conversion explicite.
            name={icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
            size={16}
            color={tone.tint}
          />
        </View>

        <View style={styles.rowText}>
          <Text numberOfLines={stacked ? 2 : 1} style={[styles.name, { color: colors.text }]}>
            {transaction.category?.name ?? 'Sans catégorie'}
          </Text>
          <Text numberOfLines={stacked ? 2 : 1} style={[styles.note, { color: colors.textMuted }]}>
            {meta}
          </Text>
          {stacked ? amount : null}
        </View>

        {stacked ? null : amount}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 3,
    borderRadius: radius.sm + 3,
  },
  rowStacked: {
    // La pastille reste en haut du bloc de texte, qui compte alors trois
    // lignes au lieu de deux.
    alignItems: 'flex-start',
  },
  glyph: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 13,
    letterSpacing: -0.07,
  },
  note: {
    fontFamily: font.regular,
    fontSize: 11,
  },
  amount: {
    fontFamily: font.bold,
    fontSize: 13,
    letterSpacing: -0.13,
    // Les montants s'alignent en colonne : sans chiffres tabulaires, la
    // virgule danse d'une ligne à l'autre.
    fontVariant: ['tabular-nums'],
  },
  amountStacked: {
    marginTop: 2,
  },
});
```

- [ ] **Step 2: Réduire `recent-transactions.tsx` à la liste**

Remplacer tout le contenu de `src/components/dashboard/recent-transactions.tsx` par :

```tsx
import { StyleSheet, Text, View } from 'react-native';

import { TransactionRow } from '@/components/transaction/transaction-row';
import type { TransactionWithCategory } from '@/data/transactions';
import { font, spacing, useColors } from '@/theme/tokens';

export function RecentTransactions({
  transactions,
}: {
  transactions: TransactionWithCategory[];
}) {
  const colors = useColors();

  if (transactions.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.textMuted }]}>
        Aucune opération pour l’instant. Touchez + pour en ajouter une.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {transactions.map((transaction) => (
        <TransactionRow key={transaction.id} transaction={transaction} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm - 1,
  },
  empty: {
    fontFamily: font.regular,
    fontSize: 14,
    paddingVertical: spacing.lg,
  },
});
```

- [ ] **Step 3: Vérifier que rien n'a bougé**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: aucune erreur.

Puis, à l'écran : `npx expo start`, ouvrir le tableau de bord. Les lignes doivent être **identiques** à avant l'extraction — mêmes tailles, mêmes couleurs, même ligne secondaire avec la date.

- [ ] **Step 4: Commit**

```bash
git add src/components/transaction/transaction-row.tsx src/components/dashboard/recent-transactions.tsx
git commit -m "refactor: extrait la ligne d'operation, partagee par les deux listes"
```

---

### Task 6: Barre de filtres

**Files:**
- Create: `src/components/history/filter-bar.tsx`
- Modify: `src/hooks/use-categories.ts`

**Interfaces:**
- Consumes: `PeriodPreset`, `PeriodPresetId` et `periodPresets` de `@/lib/dates` ; `useCategories` ; `Category` de `@/data/categories` ; `TransactionType` de `@/types/database`.
- Produces: `type HistoryFilterState = { presetId: PeriodPresetId; type: TransactionType | null; categoryId: string | null }`, et `FilterBar({ state, presets, onChange }: { state: HistoryFilterState; presets: PeriodPreset[]; onChange: (next: HistoryFilterState) => void })`.

- [ ] **Step 1: Élargir `useCategories` pour accepter « Tout »**

Dans `src/hooks/use-categories.ts`, changer la signature et le filtrage. Remplacer la déclaration de la fonction et le `useMemo` par :

```ts
/**
 * Catégories du groupe actif, filtrées par type : basculer sur Revenu ne doit
 * pas proposer Loyer. `null` les rend toutes, pour le filtre « Tout » de
 * l'historique.
 */
export function useCategories(type: TransactionType | null): {
  categories: Category[];
  isLoading: boolean;
  error: unknown;
} {
  const { activeGroupId } = useActiveGroup();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.categories(activeGroupId ?? ''),
    queryFn: () => listForGroup(activeGroupId as string),
    enabled: activeGroupId !== null,
  });

  const categories = useMemo(
    () => (data ?? []).filter((category) => type === null || category.type === type),
    [data, type]
  );

  return { categories, isLoading, error };
}
```

- [ ] **Step 2: Écrire la barre de filtres**

Créer `src/components/history/filter-bar.tsx` :

```tsx
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCategories } from '@/hooks/use-categories';
import type { PeriodPreset, PeriodPresetId } from '@/lib/dates';
import { font, radius, spacing, useColors } from '@/theme/tokens';
import type { TransactionType } from '@/types/database';

export type HistoryFilterState = {
  presetId: PeriodPresetId;
  type: TransactionType | null;
  categoryId: string | null;
};

/** État d'ouverture de l'écran : la période en cours, sans autre restriction. */
export const DEFAULT_FILTERS: HistoryFilterState = {
  presetId: 'current',
  type: null,
  categoryId: null,
};

const TYPE_CHOICES: { label: string; value: TransactionType | null }[] = [
  { label: 'Tout', value: null },
  { label: 'Dépenses', value: 'expense' },
  { label: 'Revenus', value: 'income' },
];

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surfaceMuted,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.chipLabel, { color: selected ? colors.primaryText : colors.textMuted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Trois contrôles empilés : période, type, catégorie.
 *
 * Ce sont des pastilles et non des `Button` : à 52 px de hauteur minimale
 * chacun, une rangée de boutons occuperait la moitié de l'écran.
 */
export function FilterBar({
  state,
  presets,
  onChange,
}: {
  state: HistoryFilterState;
  presets: PeriodPreset[];
  onChange: (next: HistoryFilterState) => void;
}) {
  const colors = useColors();
  const { categories } = useCategories(state.type);

  // Le type restreint les catégories proposées. Si la sélection courante n'y
  // figure plus, elle tombe — dérivé au rendu plutôt que synchronisé par un
  // effet, même forme que transaction-form.tsx pour le même problème.
  const categoryId =
    state.categoryId !== null &&
    categories.length > 0 &&
    !categories.some((category) => category.id === state.categoryId)
      ? null
      : state.categoryId;

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        {presets.map((preset) => (
          <Chip
            key={preset.id}
            label={preset.label}
            selected={state.presetId === preset.id}
            onPress={() => onChange({ ...state, presetId: preset.id })}
          />
        ))}
      </View>

      <View style={styles.row}>
        {TYPE_CHOICES.map((choice) => (
          <Chip
            key={choice.label}
            label={choice.label}
            selected={state.type === choice.value}
            onPress={() => onChange({ ...state, type: choice.value, categoryId })}
          />
        ))}
      </View>

      {/* Défilement horizontal dans une liste verticale : l'avertissement de
          React Native ne vise que l'imbrication sur le même axe. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollRow}
      >
        <Chip
          label="Toutes"
          selected={categoryId === null}
          onPress={() => onChange({ ...state, categoryId: null })}
        />
        {categories.map((category) => (
          <Chip
            key={category.id}
            label={category.name}
            selected={categoryId === category.id}
            onPress={() => onChange({ ...state, categoryId: category.id })}
          />
        ))}
      </ScrollView>

      <View style={[styles.rule, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  scrollRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    paddingRight: spacing.lg,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 4,
  },
  chipLabel: {
    fontFamily: font.semibold,
    fontSize: 12.5,
  },
  rule: {
    height: StyleSheet.hairlineWidth * 2,
    marginTop: spacing.xs,
  },
});
```

- [ ] **Step 3: Vérifier le typage et le lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: aucune erreur. `useCategories` reste appelée avec un type concret par `transaction-form.tsx`, la signature élargie est rétrocompatible.

- [ ] **Step 4: Commit**

```bash
git add src/components/history/filter-bar.tsx src/hooks/use-categories.ts
git commit -m "feat: barre de filtres de l'historique"
```

---

### Task 7: Écran d'historique

**Files:**
- Create: `src/app/(app)/history.tsx`
- Modify: `src/app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `useTransactionHistory`, `HISTORY_PAGE_SIZE` ; `FilterBar`, `HistoryFilterState`, `DEFAULT_FILTERS` ; `TransactionRow` ; `periodPresets`, `todayIso` ; `useActiveGroup` ; `dataErrorMessage`.
- Produces: la route `/history`.

- [ ] **Step 1: Écrire l'écran**

Créer `src/app/(app)/history.tsx` :

```tsx
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DEFAULT_FILTERS,
  FilterBar,
  type HistoryFilterState,
} from '@/components/history/filter-bar';
import { TransactionRow } from '@/components/transaction/transaction-row';
import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useTransactionHistory } from '@/hooks/use-transaction-history';
import { dataErrorMessage } from '@/lib/data-errors';
import { periodPresets, todayIso } from '@/lib/dates';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

/**
 * Historique complet du groupe actif.
 *
 * N'utilise pas `Screen` : celui-ci enveloppe un `ScrollView`, et imbriquer une
 * `FlatList` dans un `ScrollView` désactive la virtualisation — une liste
 * paginée garderait alors toutes ses lignes montées.
 */
export default function HistoryScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeGroup } = useActiveGroup();

  // État local à l'écran : aucun autre n'en dépend, et le sortir d'ici
  // obligerait à décider quand le remettre à zéro entre deux visites.
  const [filters, setFilters] = useState<HistoryFilterState>(DEFAULT_FILTERS);

  const presets = periodPresets(todayIso(), activeGroup?.periodStartDay ?? 1);
  const preset = presets.find((item) => item.id === filters.presetId) ?? presets[0];

  const {
    transactions,
    isLoading,
    error,
    isEmptyError,
    isFetchingNextPage,
    loadMore,
    retry,
    // `hasNextPage` n'est pas repris : `loadMore` s'en garde lui-même, et une
    // variable déstructurée mais inutilisée fait échouer le lint.
  } = useTransactionHistory({
    from: preset.from,
    to: preset.to,
    categoryId: filters.categoryId,
    type: filters.type,
  });

  const filtersTouched =
    filters.presetId !== DEFAULT_FILTERS.presetId ||
    filters.type !== DEFAULT_FILTERS.type ||
    filters.categoryId !== DEFAULT_FILTERS.categoryId;

  function renderEmpty() {
    if (isLoading) {
      return <ActivityIndicator color={colors.primary} style={styles.centered} />;
    }

    // Deux messages distincts : un message unique ferait croire à une
    // disparition des données là où il n'y a qu'un filtre trop étroit.
    if (filtersTouched) {
      return (
        <View style={styles.centered}>
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            Aucune opération avec ces filtres.
          </Text>
          <Button
            title="Réinitialiser les filtres"
            variant="ghost"
            onPress={() => setFilters(DEFAULT_FILTERS)}
          />
        </View>
      );
    }

    return (
      <Text style={[styles.empty, styles.centered, { color: colors.textMuted }]}>
        Aucune opération pour l’instant.
      </Text>
    );
  }

  function renderFooter() {
    if (isFetchingNextPage) {
      return <ActivityIndicator color={colors.primary} style={styles.footer} />;
    }

    // Échec d'une page suivante : le message va en pied, les lignes déjà
    // chargées restent affichées.
    if (error !== null && !isEmptyError) {
      return (
        <View style={styles.footer}>
          <Text style={[styles.error, { color: colors.danger }]}>
            {dataErrorMessage(error)}
          </Text>
          <Button title="Réessayer" variant="ghost" onPress={retry} />
        </View>
      );
    }

    return null;
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
        <Text style={[styles.title, { color: colors.text }]}>Opérations</Text>
      </View>

      {isEmptyError ? (
        <View style={styles.centered}>
          <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
          <Button title="Réessayer" variant="ghost" onPress={retry} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(transaction) => transaction.id}
          renderItem={({ item }) => <TransactionRow transaction={item} />}
          ListHeaderComponent={
            <FilterBar state={filters} presets={presets} onChange={setFilters} />
          }
          ListEmptyComponent={renderEmpty()}
          ListFooterComponent={renderFooter()}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xl * 2 },
          ]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* La spec 4.3 impose la saisie en trois taps depuis l'écran principal,
          mais l'historique est l'endroit où l'on constate un oubli : obliger à
          revenir en arrière irait contre la contrainte. */}
      <Link href="/transaction" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajouter une opération"
          style={StyleSheet.flatten([
            styles.fab,
            elevation.floating,
            { backgroundColor: colors.primary, bottom: insets.bottom + spacing.lg },
          ])}
        >
          <Text style={[styles.fabLabel, { color: colors.primaryText }]}>+</Text>
        </Pressable>
      </Link>
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
  fab: {
    position: 'absolute',
    right: spacing.lg,
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

- [ ] **Step 2: Déclarer la route**

Dans `src/app/(app)/_layout.tsx`, ajouter la ligne suivante juste après `<Stack.Screen name="index" />` :

```tsx
      <Stack.Screen name="history" />
```

- [ ] **Step 3: Vérifier le typage, le lint et le bundle**

Run: `npx tsc --noEmit && npm run lint && npx expo export --platform android --output-dir /tmp/wazu-export`
Expected: aucune erreur, bundle construit.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/history.tsx" "src/app/(app)/_layout.tsx"
git commit -m "feat: ecran d'historique pagine et filtre"
```

---

### Task 8: Lien « Tout voir » et documentation

**Files:**
- Modify: `src/app/(app)/index.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: la route `/history` de la Task 7.
- Produces: rien pour d'autres tâches.

- [ ] **Step 1: Poser le lien sur le tableau de bord**

Dans `src/app/(app)/index.tsx`, remplacer la ligne :

```tsx
      <Text style={[styles.section, { color: colors.textMuted }]}>Dernières opérations</Text>
```

par :

```tsx
      <View style={styles.sectionRow}>
        <Text style={[styles.section, { color: colors.textMuted }]}>Dernières opérations</Text>
        {/* Ouvre l'historique aux filtres par défaut, dont la période coïncide
            avec le solde affiché juste au-dessus. */}
        <Link href="/history" style={[styles.sectionLink, { color: colors.primary }]}>
          Tout voir
        </Link>
      </View>
```

Ajouter les deux styles dans le `StyleSheet.create` du même fichier, juste après `section` :

```tsx
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionLink: {
    fontFamily: font.semibold,
    fontSize: 12,
  },
```

`Link` est déjà importé dans ce fichier. `spacing` ne l'est plus : rétablir l'import en tête de fichier sous la forme `import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';`.

- [ ] **Step 2: Consigner la règle de pagination**

Dans `CLAUDE.md`, section **Data access layers**, ajouter à la fin de la section :

```markdown
History pages are **cursor-paginated on `(occurred_on, id)`**, never `OFFSET` / `.range()`. Realtime inserts rows while the user scrolls, so an offset shifts every later page: a row appears twice, or is skipped. `transactions_group_occurred_idx` and the `id` tiebreak exist for exactly this. PostgREST cannot express row-value comparison, so `listPage()` builds the equivalent predicate with `.or()`; the cursor values always come from a row the server already returned.
```

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: aucune erreur.

- [ ] **Step 4: Vérification manuelle, indispensable**

`npx expo start`, puis :

1. Saisir plus de 25 opérations, **dont au moins deux à la même date**. Sans ces deux-là, la pagination paraît correcte même si le départage est cassé.
2. Depuis le tableau de bord, toucher « Tout voir ».
3. Défiler au-delà de la 20e ligne : la page suivante se charge, **sans doublon ni ligne manquante**.
4. Changer de filtre de période : la liste repart du haut.
5. Revenir au filtre précédent : réaffichage immédiat, sans indicateur de chargement.
6. Choisir « Revenus » : la rangée de catégories ne propose plus que des catégories de revenus.
7. Filtrer sur une combinaison sans résultat : « Aucune opération avec ces filtres. » et le bouton de réinitialisation.
8. Toucher une ligne : la feuille d'édition s'ouvre. Supprimer : retour à l'historique, ligne disparue.
9. Passer en mode avion pendant le chargement de la page 2 : l'erreur apparaît **en pied de liste**, les lignes déjà chargées restent.
10. Régler la taille de police système à 200 % : les pastilles de filtre se replient, le montant passe sous le nom.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/index.tsx" CLAUDE.md
git commit -m "feat: lien Tout voir vers l'historique"
```
