# Saisie de transaction — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de créer, modifier et supprimer une transaction en trois taps au maximum depuis l'écran principal, et poser la couche d'accès aux données que les écrans 3, 5, 6 et 7 réutiliseront.

**Architecture:** Trois couches à dépendances à sens unique — écrans → hooks → `src/data/` → `supabase`. Un `ActiveGroupProvider` tient le groupe courant pour toute l'app. TanStack Query gère cache, mutations optimistes et invalidation depuis Realtime. Le formulaire vit sur une route unique présentée en `formSheet`, création sans paramètre et édition avec `?id=`.

**Tech Stack:** Expo SDK 57, expo-router v6, React 19.2, TypeScript strict, Supabase (Postgres, RLS, Realtime), `@tanstack/react-query` v5, pgTAP, jest-expo.

**Spec:** [docs/superpowers/specs/2026-09-04-saisie-transaction-design.md](../specs/2026-09-04-saisie-transaction-design.md)

## Global Constraints

- TypeScript strict, aucun `any`.
- Chaînes destinées à l'utilisateur en français ; identifiants de code en anglais ; commentaires SQL en français.
- Noms de fichiers en kebab-case, composants en PascalCase.
- Aucun écran n'importe `supabase` : les écrans passent par les hooks, les hooks par `src/data/`.
- `src/data/` n'importe jamais React.
- Les erreurs Supabase sont mappées par **code**, jamais par message — voir `src/lib/auth-errors.ts`.
- `src/types/database.ts` est généré, jamais édité à la main.
- Le compte personnel est un `budget_group` comme un autre. Aucun branchement `if (perso)`.
- Aucune navigation manuelle après une action d'authentification ; les gardes `Stack.Protected` s'en chargent.
- Avant chaque commit : `npx tsc --noEmit` et `npm run lint` doivent passer.
- Lire https://docs.expo.dev/versions/v57.0.0/ avant d'écrire du code Expo — les API de la v57 diffèrent des tutoriels plus anciens.
- Les tests pgTAP exigent Docker Desktop démarré puis `npx supabase start`.

---

## Structure des fichiers

| Fichier | Responsabilité |
| --- | --- |
| `supabase/tests/transactions_rls_test.sql` | Vérifie que les policies isolent bien les groupes |
| `src/lib/money.ts` | Analyse et formatage des montants fr-FR |
| `src/lib/data-errors.ts` | Code Postgres → message français |
| `src/lib/query-keys.ts` | Clés de cache centralisées |
| `src/lib/last-used.ts` | Dernière catégorie par groupe (AsyncStorage) |
| `src/data/groups.ts` | Adhésions de l'utilisateur |
| `src/data/categories.ts` | Catégories globales et du groupe |
| `src/data/transactions.ts` | Lecture et écriture des transactions |
| `src/providers/query-provider.tsx` | `QueryClientProvider` |
| `src/providers/active-group-provider.tsx` | Groupe actif |
| `src/hooks/use-active-group.ts` | Accès au groupe actif |
| `src/hooks/use-categories.ts` | Catégories du groupe actif |
| `src/hooks/use-recent-transactions.ts` | Cinq dernières opérations |
| `src/hooks/use-transaction-mutations.ts` | Création, modification, suppression |
| `src/hooks/use-transactions-realtime.ts` | Abonnement Realtime |
| `src/components/transaction/amount-input.tsx` | Champ montant |
| `src/components/transaction/category-picker.tsx` | Grille de catégories |
| `src/components/transaction/transaction-form.tsx` | Formulaire création/édition |
| `src/components/dashboard/recent-transactions.tsx` | Liste des dernières opérations |
| `src/app/(app)/transaction.tsx` | La feuille |
| `src/app/(app)/index.tsx` | Dashboard (modifié) |
| `src/app/(app)/_layout.tsx` | Déclare la feuille, monte le provider (modifié) |
| `src/app/_layout.tsx` | Monte `QueryProvider` (modifié) |

Ajouté par l'auto-revue du plan : `src/lib/dates.ts` et `src/lib/dates.test.ts` (tâche 14), que la structure ci-dessus ne listait pas.

**Note sur la vérification des tâches d'interface.** La spec exclut les tests de rendu et les mocks de Supabase pour cette passe. Les tâches 9 à 13 se vérifient donc par `npx tsc --noEmit`, `npm run lint` et un passage manuel dans l'app, décrit à chaque fois. Ce n'est pas un oubli : c'est la décision prise dans la spec, section Tests.

**Écart assumé avec la spec.** La spec annonce `src/lib/validation.ts` « étendu aux règles de transaction ». Aucune tâche ne le fait, et c'est volontaire : les règles de montant vivent entièrement dans `parseAmount()` (tâche 2) et l'obligation de catégorie dans le formulaire (tâche 11). Ajouter une troisième couche de validation dupliquerait ces règles sans rien garantir de plus. `src/lib/validation.ts` reste dédié aux formulaires d'authentification.

---

## Task 1: Tests pgTAP des policies sur `transactions`

Ne dépend d'aucun code applicatif. À faire en premier : si une policy ne se comporte pas comme la spec le suppose, tout le reste est bâti sur du sable.

**Files:**
- Create: `supabase/tests/transactions_rls_test.sql`

**Interfaces:**
- Consumes: le schéma des migrations `20260904000100` à `20260904000400`
- Produces: rien pour le code applicatif ; garantit que `is_group_member()` isole les groupes

- [ ] **Step 1: Démarrer la stack locale**

Docker Desktop doit tourner.

```bash
npx supabase start
```

Attendu : les 4 migrations s'appliquent, la commande affiche `DB_URL`.

- [ ] **Step 2: Écrire le test complet**

Créer `supabase/tests/transactions_rls_test.sql` :

```sql
-- Isolation des transactions entre groupes.
--
-- La sécurité de Wazu Finance vit dans la base : un utilisateur ne lit et
-- n'écrit que les transactions des groupes dont il est membre. Ces tests
-- exercent les policies en se faisant passer pour chaque utilisateur, via le
-- rôle authenticated et la claim JWT sub.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(9);

-- ---------------------------------------------------------------------------
-- Fixtures, créées en tant que postgres (RLS contourné)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'alice@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c2', 'bob@example.com',   '{"display_name": "Bob"}'::jsonb);

-- Chaque inscription a créé un groupe personnel via handle_new_user().
-- On ajoute un groupe partagé dont seule Alice est membre.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000d1', 'Colocation',
        '00000000-0000-0000-0000-0000000000c1', false);

insert into public.account_memberships (group_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000c1', 'owner');

insert into public.transactions (id, group_id, user_id, category_id, type, amount, occurred_on)
values ('00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000c1',
        (select id from public.categories where group_id is null and name = 'Alimentation'),
        'expense', 24.90, current_date);

-- ---------------------------------------------------------------------------
-- Alice, membre du groupe partagé
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.transactions
    where group_id = '00000000-0000-0000-0000-0000000000d1'),
  1,
  'Un membre lit les transactions de son groupe'
);

SELECT is(
  (select count(*)::int from public.categories where group_id is null),
  14,
  'Les catégories par défaut sont lisibles par tout utilisateur authentifié'
);

SELECT lives_ok(
  $$insert into public.transactions (group_id, user_id, type, amount, category_id)
    values ('00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000000c1',
            'expense', 10.00,
            (select id from public.categories where group_id is null and name = 'Transport'))$$,
  'Un membre insère dans son groupe'
);

-- user_id est imposé par la policy : on ne peut pas écrire au nom d'un autre.
SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, type, amount)
    values ('00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000000c2',
            'expense', 10.00)$$,
  '42501',
  NULL,
  'Un membre ne peut pas insérer au nom d''un autre utilisateur'
);

-- ---------------------------------------------------------------------------
-- Bob, étranger au groupe partagé
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.transactions
    where group_id = '00000000-0000-0000-0000-0000000000d1'),
  0,
  'Un non-membre ne voit aucune transaction du groupe'
);

SELECT throws_ok(
  $$insert into public.transactions (group_id, user_id, type, amount)
    values ('00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000000c2',
            'expense', 10.00)$$,
  '42501',
  NULL,
  'Un non-membre ne peut pas insérer dans le groupe'
);

-- Un UPDATE bloqué par RLS ne lève pas d'erreur : il ne touche aucune ligne.
update public.transactions set amount = 999.00
 where id = '00000000-0000-0000-0000-0000000000e1';

SELECT is(
  (select count(*)::int from public.transactions
    where id = '00000000-0000-0000-0000-0000000000e1'),
  0,
  'Un non-membre ne voit pas la ligne qu''il tente de modifier'
);

delete from public.transactions where id = '00000000-0000-0000-0000-0000000000e1';

-- Retour en postgres pour constater l'état réel, hors RLS.
set local role postgres;

SELECT is(
  (select amount from public.transactions
    where id = '00000000-0000-0000-0000-0000000000e1'),
  24.90::numeric(12,2),
  'La transaction est intacte : ni modifiée ni supprimée par le non-membre'
);

-- ---------------------------------------------------------------------------
-- Budget partagé : tout membre corrige les lignes du groupe
-- ---------------------------------------------------------------------------

insert into public.account_memberships (group_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000c2', 'member');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);

update public.transactions set amount = 30.00
 where id = '00000000-0000-0000-0000-0000000000e1';

set local role postgres;

SELECT is(
  (select amount from public.transactions
    where id = '00000000-0000-0000-0000-0000000000e1'),
  30.00::numeric(12,2),
  'Un membre corrige une ligne créée par un autre membre du même groupe'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 3: Lancer les tests**

```bash
npm run test:db
```

Attendu : `Files=2, Tests=27, Result: PASS` — les 18 assertions de `handle_new_user_test.sql` plus les 9 nouvelles.

Si une assertion `throws_ok` échoue en signalant un code différent de `42501`, ne pas modifier le test pour qu'il passe : c'est la policy qu'il faut comprendre. Signaler avant de continuer.

- [ ] **Step 4: Arrêter la stack**

```bash
npx supabase stop
```

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/transactions_rls_test.sql
git commit -m "test: isolation des transactions entre groupes"
```

---

## Task 2: Runner JS et module `money.ts`

**Files:**
- Create: `src/lib/money.ts`
- Create: `src/lib/money.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `parseAmount(input: string): number | null` — `null` si invalide
  - `formatAmount(value: number): string` — `"24,90"`, sans symbole
  - `formatSigned(value: number, type: TransactionType): string` — `"-24,90 €"` / `"+1 500,00 €"`

- [ ] **Step 1: Installer le runner**

```bash
npx expo install jest-expo jest
npm install --save-dev @types/jest
```

Ajouter dans `package.json`, dans `scripts` :

```json
"test": "jest"
```

et à la racine de `package.json` :

```json
"jest": {
  "preset": "jest-expo"
}
```

- [ ] **Step 2: Écrire les tests qui échouent**

Créer `src/lib/money.test.ts` :

```ts
import { formatAmount, formatSigned, parseAmount } from '@/lib/money';

describe('parseAmount', () => {
  it('accepte la virgule décimale française', () => {
    expect(parseAmount('24,90')).toBe(24.9);
  });

  it('accepte aussi le point décimal', () => {
    expect(parseAmount('24.90')).toBe(24.9);
  });

  it('accepte un entier', () => {
    expect(parseAmount('650')).toBe(650);
  });

  it('ignore les espaces autour', () => {
    expect(parseAmount('  12,50 ')).toBe(12.5);
  });

  it('refuse une chaîne vide', () => {
    expect(parseAmount('')).toBeNull();
  });

  it('refuse zéro, le schéma exige un montant strictement positif', () => {
    expect(parseAmount('0')).toBeNull();
  });

  it('refuse un montant négatif : le signe vient du type', () => {
    expect(parseAmount('-10')).toBeNull();
  });

  it('refuse plus de deux décimales', () => {
    expect(parseAmount('10,999')).toBeNull();
  });

  it('refuse ce qui n’est pas un nombre', () => {
    expect(parseAmount('douze')).toBeNull();
  });

  it('refuse un montant hors capacité de numeric(12,2)', () => {
    expect(parseAmount('12345678901')).toBeNull();
  });
});

describe('formatAmount', () => {
  it('affiche deux décimales avec une virgule', () => {
    expect(formatAmount(24.9)).toBe('24,90');
  });

  it('sépare les milliers', () => {
    expect(formatAmount(1500)).toBe('1 500,00');
  });
});

describe('formatSigned', () => {
  it('préfixe une dépense d’un moins', () => {
    expect(formatSigned(24.9, 'expense')).toBe('-24,90 €');
  });

  it('préfixe un revenu d’un plus', () => {
    expect(formatSigned(1500, 'income')).toBe('+1 500,00 €');
  });
});
```

- [ ] **Step 3: Vérifier que les tests échouent**

```bash
npm test
```

Attendu : ÉCHEC, `Cannot find module '@/lib/money'`.

- [ ] **Step 4: Écrire l'implémentation**

Créer `src/lib/money.ts` :

```ts
import type { TransactionType } from '@/types/database';

/**
 * Montants en euros.
 *
 * La base stocke du numeric(12,2) : au plus deux décimales, et une valeur
 * strictement positive imposée par la contrainte `amount > 0`. Le signe
 * affiché vient du type de la transaction, jamais de la saisie.
 */

const MAX_AMOUNT = 9_999_999_999.99;

/** Renvoie null si la saisie ne peut pas devenir un montant valide. */
export function parseAmount(input: string): number | null {
  const normalised = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) {
    return null;
  }

  const value = Number(normalised);
  if (value <= 0 || value > MAX_AMOUNT) {
    return null;
  }

  return value;
}

const formatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** « 1 500,00 », sans symbole monétaire. */
export function formatAmount(value: number): string {
  return formatter.format(value);
}

/** « -24,90 € » pour une dépense, « +1 500,00 € » pour un revenu. */
export function formatSigned(value: number, type: TransactionType): string {
  const sign = type === 'expense' ? '-' : '+';
  return `${sign}${formatAmount(value)} €`;
}
```

- [ ] **Step 5: Vérifier que les tests passent**

```bash
npm test
```

Attendu : 14 tests passent.

`Intl.NumberFormat('fr-FR')` insère une espace insécable étroite entre milliers. Si l'assertion `'1 500,00'` échoue sur ce seul caractère, corriger le test pour utiliser `'1 500,00'` — c'est la sortie correcte, pas un bug.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npm run lint
git add package.json package-lock.json src/lib/money.ts src/lib/money.test.ts
git commit -m "feat: montants en euros, avec jest-expo pour les modules purs"
```

---

## Task 3: Messages d'erreur des données

**Files:**
- Create: `src/lib/data-errors.ts`
- Create: `src/lib/data-errors.test.ts`

**Interfaces:**
- Produces: `dataErrorMessage(error: unknown): string`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/lib/data-errors.test.ts` :

```ts
import { dataErrorMessage } from '@/lib/data-errors';

describe('dataErrorMessage', () => {
  it('traduit un refus de RLS', () => {
    expect(dataErrorMessage({ code: '42501', message: 'permission denied' })).toBe(
      "Vous n'avez pas accès à ce budget."
    );
  });

  it('traduit une clé étrangère rompue', () => {
    expect(dataErrorMessage({ code: '23503', message: 'violates foreign key' })).toBe(
      "Cette catégorie n'existe plus."
    );
  });

  it('traduit une contrainte de vérification', () => {
    expect(dataErrorMessage({ code: '23514', message: 'violates check' })).toBe(
      'Montant invalide.'
    );
  });

  it('traduit un doublon', () => {
    expect(dataErrorMessage({ code: '23505', message: 'duplicate key' })).toBe(
      'Cette opération existe déjà.'
    );
  });

  it('reconnaît une panne réseau', () => {
    expect(dataErrorMessage(new TypeError('Network request failed'))).toBe(
      'Pas de connexion. Réessayez.'
    );
  });

  it('retombe sur un message générique', () => {
    expect(dataErrorMessage({ code: 'XX999', message: 'boom' })).toBe(
      'Une erreur inattendue est survenue.'
    );
  });

  it('supporte une valeur qui n’est pas une erreur', () => {
    expect(dataErrorMessage(undefined)).toBe('Une erreur inattendue est survenue.');
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
npm test -- data-errors
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Step 3: Écrire l'implémentation**

Créer `src/lib/data-errors.ts` :

```ts
/**
 * Messages français pour les erreurs de données.
 *
 * On mappe les codes SQLSTATE, jamais les messages : ceux-ci changent entre
 * versions de Postgres et de PostgREST. Même règle que src/lib/auth-errors.ts.
 */

const MESSAGES: Record<string, string> = {
  '42501': "Vous n'avez pas accès à ce budget.",
  '23503': "Cette catégorie n'existe plus.",
  '23514': 'Montant invalide.',
  '23505': 'Cette opération existe déjà.',
  PGRST116: 'Cette opération est introuvable.',
};

const GENERIC = 'Une erreur inattendue est survenue.';

function hasCode(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

export function dataErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes('Network request failed')) {
    return 'Pas de connexion. Réessayez.';
  }

  if (hasCode(error)) {
    return MESSAGES[error.code] ?? GENERIC;
  }

  return GENERIC;
}
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
npm test -- data-errors
```

Attendu : 7 tests passent.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npm run lint
git add src/lib/data-errors.ts src/lib/data-errors.test.ts
git commit -m "feat: messages francais des erreurs de donnees, mappes par code"
```

---

## Task 4: TanStack Query et clés de cache

**Files:**
- Create: `src/lib/query-keys.ts`
- Create: `src/providers/query-provider.tsx`
- Modify: `src/app/_layout.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `queryKeys.memberships(): readonly ['memberships']`
  - `queryKeys.categories(groupId: string): readonly ['categories', string]`
  - `queryKeys.recentTransactions(groupId: string): readonly ['transactions', 'recent', string]`
  - `queryKeys.transaction(id: string): readonly ['transactions', 'detail', string]`
  - `<QueryProvider>` — composant à monter au-dessus des routes

- [ ] **Step 1: Installer la dépendance**

```bash
npx expo install @tanstack/react-query
```

- [ ] **Step 2: Créer les clés de cache**

Créer `src/lib/query-keys.ts` :

```ts
/**
 * Clés de cache TanStack Query, centralisées.
 *
 * Les invalidations se font par préfixe : invalider ['transactions'] touche
 * la liste récente et les détails. Éparpiller les clés dans les hooks conduit
 * tôt ou tard à une invalidation qui rate sa cible.
 */
export const queryKeys = {
  memberships: () => ['memberships'] as const,
  categories: (groupId: string) => ['categories', groupId] as const,
  recentTransactions: (groupId: string) => ['transactions', 'recent', groupId] as const,
  transaction: (id: string) => ['transactions', 'detail', id] as const,
};
```

- [ ] **Step 3: Créer le provider**

Créer `src/providers/query-provider.tsx` :

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * Le QueryClient est créé dans un état pour survivre aux rendus sans être
 * partagé entre plusieurs instances de l'app.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Realtime invalide déjà le cache sur changement distant : un
            // rechargement périodique ferait double emploi.
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 4: Monter le provider dans le layout racine**

Dans `src/app/_layout.tsx`, ajouter l'import :

```tsx
import { QueryProvider } from '@/providers/query-provider';
```

et envelopper `AuthProvider` — le cache doit être vidé quand la session change, donc il se place au-dessus :

```tsx
  return (
    <QueryProvider>
      <AuthProvider>
        <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
          <RootNavigator />
        </ThemeProvider>
      </AuthProvider>
    </QueryProvider>
  );
```

- [ ] **Step 5: Vérifier**

```bash
npx tsc --noEmit
npm run lint
npx expo start --clear
```

Attendu : l'app démarre, l'écran de connexion ou le dashboard s'affiche comme avant. Aucun changement visible — le provider ne fait encore rien.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/query-keys.ts src/providers/query-provider.tsx src/app/_layout.tsx
git commit -m "feat: cache de donnees avec TanStack Query"
```

---

## Task 5: Adhésions et groupe actif

**Files:**
- Create: `src/data/groups.ts`
- Create: `src/providers/active-group-provider.tsx`
- Create: `src/hooks/use-active-group.ts`
- Modify: `src/app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `queryKeys.memberships()`
- Produces:
  - `type MembershipSummary = { groupId: string; name: string; isPersonal: boolean; role: MembershipRole }`
  - `listMemberships(): Promise<MembershipSummary[]>`
  - `useActiveGroup(): { groups: MembershipSummary[]; activeGroupId: string | null; activeGroup: MembershipSummary | null; setActiveGroupId: (id: string) => void; isLoading: boolean }`

- [ ] **Step 1: Écrire l'accès aux données**

Créer `src/data/groups.ts` :

```ts
import { supabase } from '@/lib/supabase';
import type { MembershipRole } from '@/types/database';

export type MembershipSummary = {
  groupId: string;
  name: string;
  isPersonal: boolean;
  role: MembershipRole;
};

/**
 * Groupes dont l'utilisateur courant est membre, le compte personnel en tête.
 *
 * Les policies RLS filtrent déjà sur l'appelant : aucun filtre côté client
 * n'est nécessaire, et en ajouter un donnerait la fausse impression que la
 * sécurité vit ici.
 */
export async function listMemberships(): Promise<MembershipSummary[]> {
  const { data, error } = await supabase
    .from('account_memberships')
    .select('role, budget_groups(id, name, is_personal)')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data
    .filter((row) => row.budget_groups !== null)
    .map((row) => ({
      groupId: row.budget_groups.id,
      name: row.budget_groups.name,
      isPersonal: row.budget_groups.is_personal,
      role: row.role,
    }))
    .sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal));
}
```

- [ ] **Step 2: Écrire le provider**

Créer `src/providers/active-group-provider.tsx` :

```tsx
import { useQuery } from '@tanstack/react-query';
import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { listMemberships, type MembershipSummary } from '@/data/groups';
import { queryKeys } from '@/lib/query-keys';

export type ActiveGroupState = {
  groups: MembershipSummary[];
  activeGroupId: string | null;
  activeGroup: MembershipSummary | null;
  setActiveGroupId: (groupId: string) => void;
  isLoading: boolean;
};

export const ActiveGroupContext = createContext<ActiveGroupState | null>(null);

/**
 * Groupe courant de l'app.
 *
 * Le compte personnel est un budget_group comme un autre : il arrive en tête
 * de la liste et sert de valeur initiale, sans chemin de code distinct.
 */
export function ActiveGroupProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.memberships(),
    queryFn: listMemberships,
  });

  const groups = useMemo(() => data ?? [], [data]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Sélection initiale, et rattrapage si le groupe actif disparaît (départ
  // d'un groupe partagé, par exemple).
  useEffect(() => {
    if (groups.length === 0) {
      return;
    }
    if (!groups.some((group) => group.groupId === activeGroupId)) {
      setActiveGroupId(groups[0].groupId);
    }
  }, [groups, activeGroupId]);

  const value = useMemo<ActiveGroupState>(
    () => ({
      groups,
      activeGroupId,
      activeGroup: groups.find((group) => group.groupId === activeGroupId) ?? null,
      setActiveGroupId,
      isLoading,
    }),
    [groups, activeGroupId, isLoading]
  );

  return <ActiveGroupContext.Provider value={value}>{children}</ActiveGroupContext.Provider>;
}
```

- [ ] **Step 3: Écrire le hook**

Créer `src/hooks/use-active-group.ts` :

```ts
import { useContext } from 'react';

import { ActiveGroupContext, type ActiveGroupState } from '@/providers/active-group-provider';

export function useActiveGroup(): ActiveGroupState {
  const context = useContext(ActiveGroupContext);
  if (!context) {
    throw new Error('useActiveGroup doit être utilisé à l’intérieur de <ActiveGroupProvider>.');
  }
  return context;
}
```

- [ ] **Step 4: Monter le provider**

Remplacer `src/app/(app)/_layout.tsx` :

```tsx
import { Stack } from 'expo-router';

import { ActiveGroupProvider } from '@/providers/active-group-provider';

export default function AppLayout() {
  return (
    <ActiveGroupProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
      </Stack>
    </ActiveGroupProvider>
  );
}
```

- [ ] **Step 5: Vérifier dans l'app**

Ajouter temporairement dans `src/app/(app)/index.tsx`, à l'intérieur du composant :

```tsx
  const { activeGroup } = useActiveGroup();
```

et afficher `activeGroup?.name` quelque part.

```bash
npx tsc --noEmit
npm run lint
npx expo start --clear
```

Attendu : « Compte personnel » s'affiche. Retirer ensuite l'ajout temporaire — le dashboard définitif est écrit à la tâche 12.

- [ ] **Step 6: Commit**

```bash
git add src/data/groups.ts src/providers/active-group-provider.tsx src/hooks/use-active-group.ts "src/app/(app)/_layout.tsx"
git commit -m "feat: groupe actif partage par l'app"
```

---

## Task 6: Catégories du groupe

**Files:**
- Create: `src/data/categories.ts`
- Create: `src/hooks/use-categories.ts`

**Interfaces:**
- Consumes: `queryKeys.categories(groupId)`, `useActiveGroup()`
- Produces:
  - `type Category = Tables<'categories'>`
  - `listForGroup(groupId: string): Promise<Category[]>`
  - `useCategories(type: TransactionType): { categories: Category[]; isLoading: boolean }`

- [ ] **Step 1: Écrire l'accès aux données**

Créer `src/data/categories.ts` :

```ts
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type Category = Tables<'categories'>;

/**
 * Catégories utilisables dans un groupe : les catégories par défaut
 * (group_id IS NULL, communes à tous et en lecture seule) et celles créées
 * dans le groupe.
 */
export async function listForGroup(groupId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .or(`group_id.is.null,group_id.eq.${groupId}`)
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}
```

- [ ] **Step 2: Écrire le hook**

Créer `src/hooks/use-categories.ts` :

```ts
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { listForGroup, type Category } from '@/data/categories';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';
import type { TransactionType } from '@/types/database';

/**
 * Catégories du groupe actif, filtrées par type : basculer sur Revenu ne doit
 * pas proposer Loyer.
 */
export function useCategories(type: TransactionType): {
  categories: Category[];
  isLoading: boolean;
} {
  const { activeGroupId } = useActiveGroup();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.categories(activeGroupId ?? ''),
    queryFn: () => listForGroup(activeGroupId as string),
    enabled: activeGroupId !== null,
  });

  const categories = useMemo(
    () => (data ?? []).filter((category) => category.type === type),
    [data, type]
  );

  return { categories, isLoading };
}
```

- [ ] **Step 3: Vérifier**

```bash
npx tsc --noEmit
npm run lint
```

Attendu : aucune erreur. Le hook n'est pas encore consommé ; il le sera à la tâche 10.

- [ ] **Step 4: Commit**

```bash
git add src/data/categories.ts src/hooks/use-categories.ts
git commit -m "feat: categories du groupe actif, filtrees par type"
```

---

## Task 7: Lecture des transactions

**Files:**
- Create: `src/data/transactions.ts`
- Create: `src/hooks/use-recent-transactions.ts`

**Interfaces:**
- Consumes: `queryKeys.recentTransactions(groupId)`, `queryKeys.transaction(id)`
- Produces:
  - `type TransactionWithCategory = Tables<'transactions'> & { category: { id: string; name: string; icon: string } | null }`
  - `listRecent(groupId: string, limit: number): Promise<TransactionWithCategory[]>`
  - `getById(id: string): Promise<TransactionWithCategory>`
  - `useRecentTransactions(): { transactions: TransactionWithCategory[]; isLoading: boolean; error: unknown }`

- [ ] **Step 1: Écrire l'accès aux données**

Créer `src/data/transactions.ts` :

```ts
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type TransactionWithCategory = Tables<'transactions'> & {
  category: { id: string; name: string; icon: string } | null;
};

const SELECT_WITH_CATEGORY = '*, category:categories(id, name, icon)';

/**
 * Dernières opérations du groupe, les plus récentes d'abord.
 *
 * Le tri reprend transactions_group_occurred_idx (group_id, occurred_on desc,
 * id desc) : l'index couvre le filtre et l'ordre, et le départage par id rend
 * la pagination de l'écran 3 stable quand plusieurs lignes partagent une date.
 */
export async function listRecent(
  groupId: string,
  limit: number
): Promise<TransactionWithCategory[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(SELECT_WITH_CATEGORY)
    .eq('group_id', groupId)
    .order('occurred_on', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data;
}

export async function getById(id: string): Promise<TransactionWithCategory> {
  const { data, error } = await supabase
    .from('transactions')
    .select(SELECT_WITH_CATEGORY)
    .eq('id', id)
    .single();

  if (error) {
    throw error;
  }

  return data;
}
```

- [ ] **Step 2: Écrire le hook**

Créer `src/hooks/use-recent-transactions.ts` :

```ts
import { useQuery } from '@tanstack/react-query';

import { listRecent, type TransactionWithCategory } from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';

/** Nombre de lignes affichées sur le dashboard. L'historique complet est l'écran 3. */
export const RECENT_LIMIT = 5;

export function useRecentTransactions(): {
  transactions: TransactionWithCategory[];
  isLoading: boolean;
  error: unknown;
} {
  const { activeGroupId } = useActiveGroup();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.recentTransactions(activeGroupId ?? ''),
    queryFn: () => listRecent(activeGroupId as string, RECENT_LIMIT),
    enabled: activeGroupId !== null,
  });

  return { transactions: data ?? [], isLoading, error };
}
```

- [ ] **Step 3: Vérifier**

```bash
npx tsc --noEmit
npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/data/transactions.ts src/hooks/use-recent-transactions.ts
git commit -m "feat: lecture des dernieres operations du groupe actif"
```

---

## Task 8: Dernière catégorie utilisée

**Files:**
- Create: `src/lib/last-used.ts`

**Interfaces:**
- Produces:
  - `readLastCategory(groupId: string): Promise<string | null>`
  - `writeLastCategory(groupId: string, categoryId: string): Promise<void>`

- [ ] **Step 1: Écrire l'implémentation**

Créer `src/lib/last-used.ts` :

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Dernière catégorie utilisée, par groupe.
 *
 * C'est ce qui fait tomber la saisie courante à un seul tap après le montant
 * (spec 4.3). La clé est par groupe : les habitudes du budget partagé n'ont
 * rien à voir avec celles du compte personnel.
 *
 * Une préférence d'affichage, pas une donnée : en cas d'échec de lecture ou
 * d'écriture, le formulaire retombe simplement sur aucune présélection.
 */
function storageKey(groupId: string): string {
  return `last-category:${groupId}`;
}

export async function readLastCategory(groupId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(storageKey(groupId));
  } catch {
    return null;
  }
}

export async function writeLastCategory(groupId: string, categoryId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(groupId), categoryId);
  } catch {
    // Sans effet sur la transaction enregistrée : on ne remonte pas l'erreur.
  }
}
```

- [ ] **Step 2: Vérifier**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/last-used.ts
git commit -m "feat: memorise la derniere categorie utilisee par groupe"
```

---

## Task 9: Écriture des transactions et mutations

**Files:**
- Modify: `src/data/transactions.ts`
- Create: `src/hooks/use-transaction-mutations.ts`

**Interfaces:**
- Consumes: `queryKeys`, `useActiveGroup()`, `writeLastCategory()`
- Produces:
  - `type CreateTransactionInput = { groupId: string; userId: string; categoryId: string; type: TransactionType; amount: number; occurredOn: string; note: string | null }`
  - `type UpdateTransactionInput = Omit<CreateTransactionInput, 'groupId' | 'userId'>`
  - `create(input: CreateTransactionInput): Promise<Tables<'transactions'>>`
  - `update(id: string, patch: UpdateTransactionInput): Promise<Tables<'transactions'>>`
  - `remove(id: string): Promise<void>`
  - `useTransactionMutations(): { createTransaction; updateTransaction; deleteTransaction; isPending: boolean }`

- [ ] **Step 1: Compléter l'accès aux données**

Ajouter à la fin de `src/data/transactions.ts` :

```ts
export type CreateTransactionInput = {
  groupId: string;
  userId: string;
  categoryId: string;
  type: Tables<'transactions'>['type'];
  amount: number;
  occurredOn: string;
  note: string | null;
};

export type UpdateTransactionInput = Omit<CreateTransactionInput, 'groupId' | 'userId'>;

export async function create(
  input: CreateTransactionInput
): Promise<Tables<'transactions'>> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      group_id: input.groupId,
      // La policy transactions_insert_member exige user_id = auth.uid() : cette
      // valeur est vérifiée en base, pas seulement ici.
      user_id: input.userId,
      category_id: input.categoryId,
      type: input.type,
      amount: input.amount,
      occurred_on: input.occurredOn,
      note: input.note,
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
  patch: UpdateTransactionInput
): Promise<Tables<'transactions'>> {
  const { data, error } = await supabase
    .from('transactions')
    .update({
      category_id: patch.categoryId,
      type: patch.type,
      amount: patch.amount,
      occurred_on: patch.occurredOn,
      note: patch.note,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function remove(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);

  if (error) {
    throw error;
  }
}
```

- [ ] **Step 2: Écrire le hook de mutations**

Créer `src/hooks/use-transaction-mutations.ts` :

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  create,
  remove,
  update,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { writeLastCategory } from '@/lib/last-used';
import { queryKeys } from '@/lib/query-keys';

/**
 * Création, modification et suppression d'une transaction.
 *
 * Chaque mutation invalide la liste récente du groupe : le dashboard se
 * rafraîchit sans qu'un écran ait à propager quoi que ce soit.
 */
export function useTransactionMutations() {
  const queryClient = useQueryClient();
  const { activeGroupId } = useActiveGroup();

  function invalidate() {
    if (activeGroupId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.recentTransactions(activeGroupId),
      });
    }
  }

  const createTransaction = useMutation({
    mutationFn: (input: CreateTransactionInput) => create(input),
    onSuccess: async (_data, input) => {
      // La préférence n'est mémorisée qu'une fois la ligne acceptée par la
      // base : une saisie refusée ne doit pas changer le défaut.
      await writeLastCategory(input.groupId, input.categoryId);
      invalidate();
    },
  });

  const updateTransaction = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTransactionInput }) =>
      update(id, patch),
    onSuccess: invalidate,
  });

  const deleteTransaction = useMutation({
    mutationFn: (id: string) => remove(id),
    onSuccess: invalidate,
  });

  return {
    createTransaction,
    updateTransaction,
    deleteTransaction,
    isPending:
      createTransaction.isPending ||
      updateTransaction.isPending ||
      deleteTransaction.isPending,
  };
}
```

- [ ] **Step 3: Vérifier**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/data/transactions.ts src/hooks/use-transaction-mutations.ts
git commit -m "feat: creation, modification et suppression d'une transaction"
```

---

## Task 10: Champ montant et grille de catégories

**Files:**
- Create: `src/components/transaction/amount-input.tsx`
- Create: `src/components/transaction/category-picker.tsx`
- Modify: `package.json` (icônes)

**Interfaces:**
- Consumes: `useColors()`, `spacing`, `radius`, `Category`
- Produces:
  - `<AmountInput value={string} onChangeText={(v: string) => void} autoFocus?: boolean />`
  - `<CategoryPicker categories={Category[]} selectedId={string | null} onSelect={(id: string) => void} />`

- [ ] **Step 1: Installer les icônes**

```bash
npx expo install @expo/vector-icons
```

Le champ `categories.icon` contient un nom MaterialCommunityIcons — voir la migration `20260904000300_seed_categories.sql`.

- [ ] **Step 2: Écrire le champ montant**

Créer `src/components/transaction/amount-input.tsx` :

```tsx
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { spacing, useColors } from '@/theme/tokens';

type AmountInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  autoFocus?: boolean;
};

/**
 * Montant en gros caractères, focalisé à l'ouverture de la feuille.
 *
 * Pas de pavé numérique maison : decimal-pad fait apparaître le clavier
 * système sans tap dédié, ce qui sert directement la contrainte des trois taps.
 */
export function AmountInput({ value, onChangeText, autoFocus = false }: AmountInputProps) {
  const colors = useColors();

  return (
    <View style={styles.row}>
      <TextInput
        accessibilityLabel="Montant"
        autoFocus={autoFocus}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="0,00"
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        style={[styles.input, { color: colors.text }]}
      />
      <Text style={[styles.currency, { color: colors.textMuted }]}>€</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  input: {
    fontSize: 44,
    fontWeight: '700',
    textAlign: 'right',
    minWidth: 120,
  },
  currency: {
    fontSize: 28,
    fontWeight: '600',
  },
});
```

- [ ] **Step 3: Écrire la grille de catégories**

Créer `src/components/transaction/category-picker.tsx` :

```tsx
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Category } from '@/data/categories';
import { radius, spacing, useColors } from '@/theme/tokens';

type CategoryPickerProps = {
  categories: Category[];
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
};

export function CategoryPicker({ categories, selectedId, onSelect }: CategoryPickerProps) {
  const colors = useColors();

  return (
    <View style={styles.grid}>
      {categories.map((category) => {
        const selected = category.id === selectedId;
        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={category.name}
            onPress={() => onSelect(category.id)}
            style={[
              styles.item,
              {
                backgroundColor: selected ? colors.primary : colors.surface,
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}
          >
            <MaterialCommunityIcons
              // Le nom vient de la base ; @expo/vector-icons le type de façon
              // stricte, d'où la conversion explicite.
              name={category.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
              size={22}
              color={selected ? colors.primaryText : colors.text}
            />
            <Text
              numberOfLines={1}
              style={[styles.label, { color: selected ? colors.primaryText : colors.textMuted }]}
            >
              {category.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  item: {
    width: 84,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
```

- [ ] **Step 4: Vérifier**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/transaction
git commit -m "feat: champ montant et grille de categories"
```

---

## Task 11: Formulaire et feuille modale

**Files:**
- Create: `src/components/transaction/transaction-form.tsx`
- Create: `src/app/(app)/transaction.tsx`
- Modify: `src/app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `AmountInput`, `CategoryPicker`, `useCategories`, `useTransactionMutations`, `useActiveGroup`, `useAuth`, `parseAmount`, `readLastCategory`, `dataErrorMessage`, `getById`
- Produces: la route `/transaction`, et `/transaction?id=<uuid>` en édition

- [ ] **Step 1: Écrire le formulaire**

Créer `src/components/transaction/transaction-form.tsx` :

```tsx
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AmountInput } from '@/components/transaction/amount-input';
import { CategoryPicker } from '@/components/transaction/category-picker';
import { Button } from '@/components/ui/button';
import { useCategories } from '@/hooks/use-categories';
import { readLastCategory } from '@/lib/last-used';
import { parseAmount } from '@/lib/money';
import { radius, spacing, useColors } from '@/theme/tokens';
import type { TransactionType } from '@/types/database';

export type TransactionFormValues = {
  type: TransactionType;
  amount: number;
  categoryId: string;
  occurredOn: string;
  note: string | null;
};

type TransactionFormProps = {
  groupId: string;
  initialValues?: TransactionFormValues;
  submitLabel: string;
  submitting: boolean;
  errorText?: string;
  onSubmit: (values: TransactionFormValues) => void;
  onDelete?: () => void;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Formulaire partagé entre création et édition.
 *
 * Les valeurs par défaut de la spec 4.3 sont posées ici : type dépense, date
 * du jour, et catégorie pré-remplie avec la dernière utilisée dans ce groupe.
 */
export function TransactionForm({
  groupId,
  initialValues,
  submitLabel,
  submitting,
  errorText,
  onSubmit,
  onDelete,
}: TransactionFormProps) {
  const colors = useColors();

  const [type, setType] = useState<TransactionType>(initialValues?.type ?? 'expense');
  const [amountText, setAmountText] = useState(
    initialValues ? initialValues.amount.toFixed(2).replace('.', ',') : ''
  );
  const [categoryId, setCategoryId] = useState<string | null>(initialValues?.categoryId ?? null);
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [touched, setTouched] = useState(false);

  const { categories } = useCategories(type);

  // Présélection de la dernière catégorie, uniquement en création.
  useEffect(() => {
    if (initialValues) {
      return;
    }
    let active = true;
    readLastCategory(groupId).then((lastId) => {
      if (active && lastId) {
        setCategoryId(lastId);
      }
    });
    return () => {
      active = false;
    };
  }, [groupId, initialValues]);

  // Changer de type invalide la catégorie courante, qui appartient à l'autre
  // liste.
  useEffect(() => {
    if (categoryId && !categories.some((category) => category.id === categoryId)) {
      setCategoryId(null);
    }
  }, [categories, categoryId]);

  const amount = parseAmount(amountText);
  const amountError = touched && amount === null ? 'Montant invalide.' : undefined;
  const categoryError = touched && categoryId === null ? 'Choisissez une catégorie.' : undefined;

  function handleSubmit() {
    setTouched(true);
    if (amount === null || categoryId === null) {
      return;
    }
    onSubmit({
      type,
      amount,
      categoryId,
      occurredOn: initialValues?.occurredOn ?? today(),
      note: note.trim() === '' ? null : note.trim(),
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.segmented}>
        <Button
          title="Dépense"
          variant={type === 'expense' ? 'primary' : 'ghost'}
          onPress={() => setType('expense')}
        />
        <Button
          title="Revenu"
          variant={type === 'income' ? 'primary' : 'ghost'}
          onPress={() => setType('income')}
        />
      </View>

      <AmountInput value={amountText} onChangeText={setAmountText} autoFocus={!initialValues} />
      {amountError ? <Text style={[styles.error, { color: colors.danger }]}>{amountError}</Text> : null}

      <CategoryPicker
        categories={categories}
        selectedId={categoryId}
        onSelect={setCategoryId}
      />
      {categoryError ? (
        <Text style={[styles.error, { color: colors.danger }]}>{categoryError}</Text>
      ) : null}

      <TextInput
        accessibilityLabel="Note"
        placeholder="Note (facultatif)"
        placeholderTextColor={colors.textMuted}
        value={note}
        onChangeText={setNote}
        style={[
          styles.note,
          { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
        ]}
      />

      {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

      <Button title={submitLabel} loading={submitting} onPress={handleSubmit} />
      {onDelete ? <Button title="Supprimer" variant="ghost" onPress={onDelete} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  segmented: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  error: {
    fontSize: 13,
  },
  note: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
});
```

- [ ] **Step 2: Écrire la route**

Créer `src/app/(app)/transaction.tsx` :

```tsx
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  TransactionForm,
  type TransactionFormValues,
} from '@/components/transaction/transaction-form';
import { getById } from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import { useTransactionMutations } from '@/hooks/use-transaction-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { queryKeys } from '@/lib/query-keys';
import { spacing, useColors } from '@/theme/tokens';

/**
 * Une seule route pour les deux modes : création sans paramètre, édition avec
 * ?id=. Le formulaire est ainsi écrit et corrigé une seule fois.
 */
export default function TransactionScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const { activeGroupId } = useActiveGroup();
  const { createTransaction, updateTransaction, deleteTransaction, isPending } =
    useTransactionMutations();
  const [errorText, setErrorText] = useState<string>();

  const existing = useQuery({
    queryKey: queryKeys.transaction(id ?? ''),
    queryFn: () => getById(id as string),
    enabled: typeof id === 'string',
  });

  const userId = session?.user.id;

  if (!activeGroupId || !userId) {
    return null;
  }

  if (typeof id === 'string' && existing.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  function handleSubmit(values: TransactionFormValues) {
    setErrorText(undefined);

    if (typeof id === 'string') {
      updateTransaction.mutate(
        { id, patch: values },
        {
          onSuccess: () => router.back(),
          onError: (error) => setErrorText(dataErrorMessage(error)),
        }
      );
      return;
    }

    createTransaction.mutate(
      { ...values, groupId: activeGroupId as string, userId: userId as string },
      {
        onSuccess: () => router.back(),
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  function handleDelete() {
    if (typeof id !== 'string') {
      return;
    }
    deleteTransaction.mutate(id, {
      onSuccess: () => router.back(),
      onError: (error) => setErrorText(dataErrorMessage(error)),
    });
  }

  const initialValues = existing.data
    ? {
        type: existing.data.type,
        amount: Number(existing.data.amount),
        categoryId: existing.data.category_id ?? '',
        occurredOn: existing.data.occurred_on,
        note: existing.data.note,
      }
    : undefined;

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background }]}>
      {/* Une formSheet n'accepte pas de header natif : le titre est du contenu. */}
      <Text style={[styles.title, { color: colors.text }]}>
        {typeof id === 'string' ? 'Modifier l’opération' : 'Nouvelle opération'}
      </Text>

      <TransactionForm
        groupId={activeGroupId}
        initialValues={initialValues}
        submitLabel={typeof id === 'string' ? 'Enregistrer' : 'Ajouter'}
        submitting={isPending}
        errorText={errorText}
        onSubmit={handleSubmit}
        onDelete={typeof id === 'string' ? handleDelete : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
});
```

- [ ] **Step 3: Déclarer la feuille**

Remplacer `src/app/(app)/_layout.tsx` :

```tsx
import { Stack } from 'expo-router';

import { ActiveGroupProvider } from '@/providers/active-group-provider';

export default function AppLayout() {
  return (
    <ActiveGroupProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="transaction"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
          }}
        />
      </Stack>
    </ActiveGroupProvider>
  );
}
```

- [ ] **Step 4: Vérifier**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/components/transaction/transaction-form.tsx "src/app/(app)/transaction.tsx" "src/app/(app)/_layout.tsx"
git commit -m "feat: feuille de saisie de transaction, creation et edition"
```

---

## Task 12: Dashboard — dernières opérations et bouton d'ajout

**Files:**
- Create: `src/components/dashboard/recent-transactions.tsx`
- Modify: `src/app/(app)/index.tsx`

**Interfaces:**
- Consumes: `useRecentTransactions`, `useActiveGroup`, `formatSigned`, `dataErrorMessage`
- Produces: le point d'entrée `+` vers `/transaction`, et les lignes cliquables vers `/transaction?id=`

- [ ] **Step 1: Écrire la liste**

Créer `src/components/dashboard/recent-transactions.tsx` :

```tsx
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TransactionWithCategory } from '@/data/transactions';
import { formatSigned } from '@/lib/money';
import { radius, spacing, useColors } from '@/theme/tokens';

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
        <Link key={transaction.id} href={`/transaction?id=${transaction.id}`} asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Modifier ${transaction.category?.name ?? 'opération'}`}
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons
              name={
                (transaction.category?.icon ??
                  'tag') as React.ComponentProps<typeof MaterialCommunityIcons>['name']
              }
              size={20}
              color={colors.textMuted}
            />
            <View style={styles.rowText}>
              <Text style={[styles.name, { color: colors.text }]}>
                {transaction.category?.name ?? 'Sans catégorie'}
              </Text>
              {transaction.note ? (
                <Text numberOfLines={1} style={[styles.note, { color: colors.textMuted }]}>
                  {transaction.note}
                </Text>
              ) : null}
            </View>
            <Text
              style={[
                styles.amount,
                { color: transaction.type === 'income' ? colors.primary : colors.text },
              ]}
            >
              {formatSigned(Number(transaction.amount), transaction.type)}
            </Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
  },
  note: {
    fontSize: 12,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
  empty: {
    fontSize: 14,
    paddingVertical: spacing.lg,
  },
});
```

- [ ] **Step 2: Réécrire le dashboard**

Remplacer `src/app/(app)/index.tsx` :

```tsx
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import { useRecentTransactions } from '@/hooks/use-recent-transactions';
import { dataErrorMessage } from '@/lib/data-errors';
import { radius, spacing, useColors } from '@/theme/tokens';

/**
 * Point d'entrée de la saisie. Le solde et le résumé du mois appartiennent à
 * l'écran 2 et ne sont pas encore là.
 */
export default function DashboardScreen() {
  const colors = useColors();
  const { signOut } = useAuth();
  const { activeGroup, groups } = useActiveGroup();
  const { transactions, error } = useRecentTransactions();

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.groupName, { color: colors.text }]}>
          {activeGroup?.name ?? '…'}
          {/* Le sélecteur n'apparaît qu'à partir de deux groupes : l'écran 7
              apportera le changement de groupe. */}
          {groups.length > 1 ? ' ▾' : ''}
        </Text>
      </View>

      <Text style={[styles.section, { color: colors.textMuted }]}>Dernières opérations</Text>

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
      ) : (
        <RecentTransactions transactions={transactions} />
      )}

      <Link href="/transaction" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajouter une opération"
          style={[styles.fab, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.fabLabel, { color: colors.primaryText }]}>+</Text>
        </Pressable>
      </Link>

      <Button title="Se déconnecter" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  groupName: {
    fontSize: 24,
    fontWeight: '700',
  },
  section: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  error: {
    fontSize: 14,
  },
  fab: {
    alignSelf: 'flex-end',
    width: 56,
    height: 56,
    borderRadius: radius.lg + 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabLabel: {
    fontSize: 30,
    fontWeight: '600',
    lineHeight: 34,
  },
});
```

- [ ] **Step 3: Vérifier le parcours complet dans l'app**

```bash
npx tsc --noEmit
npm run lint
npx expo start --clear
```

Vérifier, dans l'ordre :

1. Le dashboard affiche « Compte personnel » et « Aucune opération pour l'instant ».
2. Le `+` ouvre la feuille avec le clavier déjà présent sur le champ montant.
3. Saisir `24,90`, toucher Alimentation, toucher Ajouter : la feuille se ferme et la ligne apparaît en `-24,90 €`.
4. Rouvrir le `+` : Alimentation est déjà sélectionnée. Saisir `12` et valider — deux interactions après le montant.
5. Toucher une ligne : la feuille s'ouvre en édition, montant et catégorie pré-remplis, avec un bouton Supprimer.
6. Modifier le montant, enregistrer : la ligne se met à jour.
7. Supprimer : la ligne disparaît.
8. Basculer sur Revenu : la grille montre Salaire et Remboursement, pas Loyer. Un revenu s'affiche en `+…` dans la couleur primaire.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard "src/app/(app)/index.tsx"
git commit -m "feat: dashboard avec dernieres operations et bouton d'ajout"
```

---

## Task 13: Synchronisation Realtime

**Files:**
- Create: `src/hooks/use-transactions-realtime.ts`
- Modify: `src/app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `useActiveGroup()`, `queryKeys.recentTransactions()`
- Produces: `useTransactionsRealtime(): void`

- [ ] **Step 1: Écrire le hook**

Créer `src/hooks/use-transactions-realtime.ts` :

```ts
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/**
 * Sync temps réel des transactions du groupe actif (spec 4.2) : un membre voit
 * les dépenses de l'autre sans recharger l'app.
 *
 * Les policies RLS s'appliquent aussi aux messages Realtime — un abonné ne
 * reçoit que ce qu'il a le droit de lire. Le filtre serveur ci-dessous n'est
 * donc pas une mesure de sécurité, seulement une économie de trafic.
 */
export function useTransactionsRealtime(): void {
  const queryClient = useQueryClient();
  const { activeGroupId } = useActiveGroup();

  useEffect(() => {
    if (!activeGroupId) {
      return;
    }

    const channel = supabase
      .channel(`transactions:${activeGroupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `group_id=eq.${activeGroupId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.recentTransactions(activeGroupId),
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeGroupId, queryClient]);
}
```

- [ ] **Step 2: Monter l'abonnement**

Dans `src/app/(app)/_layout.tsx`, l'abonnement doit vivre **sous** `ActiveGroupProvider` — il en consomme le contexte. Remplacer le fichier :

```tsx
import { Stack } from 'expo-router';

import { useTransactionsRealtime } from '@/hooks/use-transactions-realtime';
import { ActiveGroupProvider } from '@/providers/active-group-provider';

export default function AppLayout() {
  return (
    <ActiveGroupProvider>
      <AppStack />
    </ActiveGroupProvider>
  );
}

function AppStack() {
  useTransactionsRealtime();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="transaction"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
        }}
      />
    </Stack>
  );
}
```

- [ ] **Step 3: Vérifier à deux sessions**

```bash
npx expo start --clear
```

Ouvrir l'app dans deux fenêtres — par exemple le navigateur (`w`) et un appareil — connectées au **même compte**. Ajouter une opération dans l'une : elle doit apparaître dans l'autre en une ou deux secondes, sans interaction.

Si rien n'arrive, vérifier que `transactions` figure bien dans la publication :

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```

La table y est ajoutée par la migration `20260904000100_schema.sql`.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-transactions-realtime.ts "src/app/(app)/_layout.tsx"
git commit -m "feat: sync temps reel des transactions du groupe actif"
```

---

## Task 14: Date de l'opération

La spec prévoit une date « repliée sous `Aujourd'hui ›` », modifiable. Sans elle, on ne peut pas saisir la dépense d'hier — trou fonctionnel réel pour une app de budget. Tâche séparée parce qu'elle ajoute une dépendance native et se teste indépendamment.

**Files:**
- Modify: `src/components/transaction/transaction-form.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: `TransactionFormValues.occurredOn`, déjà en place depuis la tâche 11
- Produces: rien de nouveau — le champ `occurredOn` cesse simplement d'être figé sur le jour même

- [ ] **Step 1: Installer le sélecteur**

```bash
npx expo install @react-native-community/datetimepicker
```

- [ ] **Step 2: Ajouter le formatage de date**

Créer `src/lib/dates.ts`. Ne pas toucher `src/lib/money.ts` : les dates n'ont rien à faire dans un module de montants.

```ts
/**
 * Dates d'opération.
 *
 * La base stocke du `date` nu (pas de timestamp) : on manipule des chaînes
 * `YYYY-MM-DD` et on évite tout décalage de fuseau en construisant la date
 * locale composant par composant.
 */

export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isoToDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function dateToIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** « Aujourd'hui », « Hier », sinon « 2 sept. 2026 ». */
export function formatOccurredOn(iso: string): string {
  if (iso === todayIso()) {
    return "Aujourd'hui";
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === dateToIso(yesterday)) {
    return 'Hier';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(isoToDate(iso));
}
```

- [ ] **Step 3: Écrire les tests qui échouent**

Créer `src/lib/dates.test.ts` :

```ts
import { dateToIso, formatOccurredOn, isoToDate, todayIso } from '@/lib/dates';

describe('dates', () => {
  it('produit une date ISO sans décalage de fuseau', () => {
    expect(dateToIso(new Date(2026, 8, 4))).toBe('2026-09-04');
  });

  it('relit une date ISO en date locale', () => {
    const date = isoToDate('2026-09-04');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8);
    expect(date.getDate()).toBe(4);
  });

  it('nomme le jour même', () => {
    expect(formatOccurredOn(todayIso())).toBe("Aujourd'hui");
  });

  it('nomme la veille', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatOccurredOn(dateToIso(yesterday))).toBe('Hier');
  });

  it('formate une date plus ancienne', () => {
    expect(formatOccurredOn('2026-01-15')).toContain('2026');
  });
});
```

- [ ] **Step 4: Vérifier que les tests échouent puis passent**

```bash
npm test -- dates
```

Attendu : d'abord ÉCHEC (module introuvable), puis 5 tests qui passent une fois `src/lib/dates.ts` créé.

- [ ] **Step 5: Brancher le sélecteur dans le formulaire**

Dans `src/components/transaction/transaction-form.tsx` :

Remplacer la fonction locale `today()` par l'import :

```tsx
import DateTimePicker from '@react-native-community/datetimepicker';
import { dateToIso, formatOccurredOn, isoToDate, todayIso } from '@/lib/dates';
```

Supprimer la définition locale de `today()`.

Ajouter deux états, sous les autres `useState` :

```tsx
  const [occurredOn, setOccurredOn] = useState(initialValues?.occurredOn ?? todayIso());
  const [pickerOpen, setPickerOpen] = useState(false);
```

Dans `handleSubmit`, remplacer `occurredOn: initialValues?.occurredOn ?? today(),` par :

```tsx
      occurredOn,
```

Insérer avant le champ Note :

```tsx
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Date : ${formatOccurredOn(occurredOn)}`}
        onPress={() => setPickerOpen(true)}
        style={[styles.dateRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.dateLabel, { color: colors.text }]}>
          {formatOccurredOn(occurredOn)}
        </Text>
        <Text style={[styles.dateChevron, { color: colors.textMuted }]}>›</Text>
      </Pressable>

      {pickerOpen ? (
        <DateTimePicker
          value={isoToDate(occurredOn)}
          mode="date"
          // Une opération future n'a pas de sens dans un suivi de dépenses.
          maximumDate={new Date()}
          onChange={(_event, date) => {
            setPickerOpen(false);
            if (date) {
              setOccurredOn(dateToIso(date));
            }
          }}
        />
      ) : null}
```

Ajouter `Pressable` à l'import depuis `react-native`, et ces styles :

```tsx
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  dateLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  dateChevron: {
    fontSize: 20,
  },
```

- [ ] **Step 6: Vérifier dans l'app**

```bash
npx tsc --noEmit
npm run lint
npx expo start --clear
```

Attendu : la feuille affiche `Aujourd'hui ›`. Le toucher ouvre le sélecteur natif ; choisir la veille affiche `Hier`. Enregistrer, puis rouvrir la ligne en édition : la date choisie est conservée. Les dates futures sont refusées par le sélecteur.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/dates.ts src/lib/dates.test.ts src/components/transaction/transaction-form.tsx
git commit -m "feat: date d'operation modifiable, aujourd'hui par defaut"
```

---

## Task 15: Mise à jour de la documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Documenter les nouvelles règles**

Dans `CLAUDE.md`, ajouter la commande de test JS à la section Commands :

```bash
npm test                 # jest-expo — modules purs uniquement (money, validation, erreurs)
```

Ajouter une section après « Core data model decision » :

```markdown
## Data access layers

`écrans → hooks → src/data/ → supabase`, dépendances à sens unique. Un écran n'importe jamais `supabase` ; `src/data/` n'importe jamais React. TanStack Query tient le cache ; les clés vivent toutes dans `src/lib/query-keys.ts` pour que les invalidations ne ratent pas leur cible.

`ActiveGroupProvider` tient le groupe courant pour toute l'app, initialisé sur le compte personnel. Les écrans écrivent dans le groupe actif ; ils ne choisissent pas de `group_id` eux-mêmes.

Les erreurs de données sont mappées par code SQLSTATE dans `src/lib/data-errors.ts`, jamais par message.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: couche d'acces aux donnees et commande de test JS"
```

---

## Vérification finale

- [ ] `npx tsc --noEmit` — aucune erreur
- [ ] `npm run lint` — aucune erreur
- [ ] `npm test` — 26 tests passent
- [ ] `npx supabase start && npm run test:db` — 27 assertions pgTAP passent, puis `npx supabase stop`
- [ ] Parcours manuel de la tâche 12, étapes 1 à 8
- [ ] `git push origin main`
