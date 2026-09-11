# Objectifs d'épargne (écran 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer l'écran 6 — créer, modifier, suivre et supprimer un objectif d'épargne personnel, avec une entrée sur le tableau de bord.

**Architecture:** Aucune migration : la table `savings_goals`, sa policy RLS et son trigger `updated_at` existent depuis le 4 septembre. Ce plan ajoute la couche donnée (`src/data`), un module pur de calcul de progression testé par Jest, les hooks TanStack Query, les composants et les deux écrans (liste + fiche création/édition), plus le fichier pgTAP qui manque pour la table.

**Tech Stack:** Expo SDK 57, expo-router v6 (formSheet), TypeScript strict, TanStack Query v5, Supabase (Postgres, RLS, Realtime), Jest, pgTAP.

**Spec:** [docs/superpowers/specs/2026-09-11-objectifs-epargne-design.md](../specs/2026-09-11-objectifs-epargne-design.md)

## Global Constraints

- TypeScript strict, aucun `any`.
- Chaînes visibles en français, avec tous leurs accents ; identifiants de code en anglais. Apostrophe typographique `’` (U+2019) dans tout texte JSX, jamais l'apostrophe droite (`react/no-unescaped-entities` échoue dessus).
- Noms de fichiers en kebab-case, composants en PascalCase.
- Un commit par tâche, message en français **sans accents**, comme le reste de l'historique. Aucun `git push` sans consigne explicite.
- `src/types/database.ts` est **généré** — ne jamais l'éditer à la main. Ce plan ne touche à aucune migration, donc aucune régénération n'est nécessaire : `Tables<'savings_goals'>` existe déjà.
- Vérification à chaque tâche touchant du code applicatif : `npx tsc --noEmit` et `npm run lint` propres.
- `npm run test:db` exige Docker Desktop démarré puis `npx supabase start` (déjà fait si le stack tourne). Aucune migration dans ce plan : pas de `npx supabase db reset` nécessaire, seulement relancer `npm run test:db` pour que `pg_prove` ramasse le nouveau fichier.
- Aucun composant ni hook n'a de test JS dans ce projet : seuls `src/lib/*.ts` sont couverts par Jest. Les fichiers d'écran/composant se vérifient par tsc + lint + relecture manuelle finale.
- Un écran n'importe jamais `supabase` directement ; il passe par `src/data/` via un hook.
- `<Link asChild>` : le style de l'enfant passe toujours par `StyleSheet.flatten(...)`, jamais un tableau — l'erreur ne se voit qu'en développement sur appareil.
- Échelle de police suivie, jamais plafonnée : empiler au-delà de `stackAtFontScale`, ne jamais ajouter de nouveau plafond (seuls `AmountInput` et le solde du tableau de bord en ont un).
- Sécurité en base (RLS), jamais un filtre côté client qui la doublerait.
- Un type dérivé d'une table générée se définit une seule fois, dans `src/data/`, et se réimporte partout ailleurs — jamais redéfini localement (voir `BudgetWithCategory`, défini dans `src/data/budgets.ts` et importé tel quel par `src/lib/budget-progress.ts`).

---

### Task 1: Test pgTAP de la policy `savings_goals`

**Files:**
- Create: `supabase/tests/savings_goals_rls_test.sql`

**Interfaces:**
- Consomme : la table `savings_goals` et la policy `savings_goals_all_own` (`for all`, `user_id = auth.uid()` en using et en check), déjà en place depuis `20260904000100_schema.sql` / `20260904000200_policies.sql`. Aucune modification de schéma.
- Produit : rien pour les tâches suivantes — ce fichier caractérise un comportement déjà en place, il ne bloque aucune autre tâche.

Contrairement à un cycle TDD classique, la policy existe déjà : ce test la **caractérise**, il ne la fait pas naître. La première exécution doit donc réussir directement (pas de phase RED), comme `budgets_rls_test.sql` en son temps pour la table `budgets`.

- [ ] **Step 1: Écrire le fichier de test**

```sql
-- Policy et contraintes de la table savings_goals.
--
-- Quatre choses a prouver : un utilisateur lit, cree, modifie et supprime ses
-- propres objectifs ; un autre membre du meme groupe partage ne voit ni ne
-- modifie ses objectifs a lui (portee personnelle, jamais partagee, meme
-- dans un groupe commun) ; target_amount > 0 et current_amount >= 0 sont
-- tenus ; un utilisateur ne peut pas creer un objectif au nom d'un autre.
--
--   npm run test:db

create extension if not exists pgtap with schema extensions;

BEGIN;
SELECT plan(10);

-- ---------------------------------------------------------------------------
-- Fixtures, creees en tant que postgres (RLS contournee)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'alice@example.com', '{"display_name": "Alice"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e2', 'bob@example.com',   '{"display_name": "Bob"}'::jsonb);

-- Un groupe partage entre les deux, pour prouver que l'appartenance commune
-- ne donne aucune visibilite sur les objectifs de l'autre.
insert into public.budget_groups (id, name, owner_id, is_personal)
values ('00000000-0000-0000-0000-0000000000e3', 'Colocation',
        '00000000-0000-0000-0000-0000000000e1', false);

insert into public.account_memberships (group_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e1', 'owner'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e2', 'member');

insert into public.savings_goals (id, user_id, name, target_amount, current_amount)
values ('00000000-0000-0000-0000-0000000000e4',
        '00000000-0000-0000-0000-0000000000e1', 'Vacances', 1000.00, 100.00);

-- ---------------------------------------------------------------------------
-- Alice
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.savings_goals
    where user_id = '00000000-0000-0000-0000-0000000000e1'),
  1,
  'Alice lit son propre objectif'
);

SELECT throws_ok(
  $$insert into public.savings_goals (user_id, name, target_amount)
    values ('00000000-0000-0000-0000-0000000000e1', 'Voiture', 0)$$,
  '23514',
  NULL,
  'Un montant cible nul est refuse par la contrainte check'
);

SELECT throws_ok(
  $$insert into public.savings_goals (user_id, name, target_amount, current_amount)
    values ('00000000-0000-0000-0000-0000000000e1', 'Voiture', 200, -10)$$,
  '23514',
  NULL,
  'Un montant actuel negatif est refuse par la contrainte check'
);

-- Le `with check` de la policy porte sur user_id = auth.uid() : tenter de
-- creer un objectif au nom de Bob doit echouer, meme si la ligne elle-meme
-- serait par ailleurs valide.
SELECT throws_ok(
  $$insert into public.savings_goals (user_id, name, target_amount)
    values ('00000000-0000-0000-0000-0000000000e2', 'Objectif de Bob', 500)$$,
  '42501',
  NULL,
  'Alice ne peut pas creer un objectif au nom de Bob'
);

-- Les trois tentatives ci-dessus echouent sur des contraintes ou le check de
-- la policy, pas sur une simple absence de droit d'ecriture : cette insertion
-- est valide de bout en bout et passe par le role authenticated.
SELECT lives_ok(
  $$insert into public.savings_goals (user_id, name, target_amount, current_amount)
    values ('00000000-0000-0000-0000-0000000000e1', 'Voiture', 5000, 0)$$,
  'Alice insere un nouvel objectif valide, montant actuel a zero compris'
);

-- ---------------------------------------------------------------------------
-- Bob, membre du meme groupe qu'Alice
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);

SELECT is(
  (select count(*)::int from public.savings_goals
    where user_id = '00000000-0000-0000-0000-0000000000e1'),
  0,
  'Bob ne voit aucun objectif d''Alice, meme en partageant un groupe avec elle'
);

-- Un UPDATE que la policy ne laisse pas voir ne leve pas d'erreur : il ne
-- touche simplement aucune ligne. L'absence d'exception ne suffit pas a le
-- prouver seule (une policy absente ou un `using (true)` passeraient tout
-- autant ce test), d'ou la relecture en role postgres plus bas.
SELECT lives_ok(
  $$update public.savings_goals set current_amount = 999
     where id = '00000000-0000-0000-0000-0000000000e4'$$,
  'Bob ne modifie aucune ligne sur l''objectif d''Alice, sans erreur'
);

-- Meme logique pour la suppression.
SELECT lives_ok(
  $$delete from public.savings_goals where id = '00000000-0000-0000-0000-0000000000e4'$$,
  'Bob ne supprime aucune ligne sur l''objectif d''Alice, sans erreur'
);

-- ---------------------------------------------------------------------------
-- Retour en postgres pour constater l'etat reel, hors RLS
-- ---------------------------------------------------------------------------

set local role postgres;

SELECT is(
  (select current_amount from public.savings_goals
    where id = '00000000-0000-0000-0000-0000000000e4'),
  100.00::numeric(12,2),
  'L''objectif d''Alice est intact : Bob ne l''a pas modifie'
);

SELECT is(
  (select count(*)::int from public.savings_goals
    where user_id = '00000000-0000-0000-0000-0000000000e1'),
  2,
  'Les deux objectifs d''Alice existent toujours : Bob n''en a supprime aucun'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Lancer les tests et vérifier que tout passe**

Run: `npm run test:db`
Expected: `savings_goals_rls_test.sql` passe ses 10 assertions dès ce premier lancement (pas de RED : la policy existe déjà), et les autres fichiers restent verts (86/86 avant cette tâche, donc 96/96 après).

Si Docker ou le stack local ne démarrent pas : s'arrêter et le signaler, ne jamais sauter ce test.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/savings_goals_rls_test.sql
git commit -m "test(db): pgtap pour la policy savings_goals

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `parseNonNegativeAmount` dans `src/lib/money.ts`

**Files:**
- Modify: `src/lib/money.ts`
- Modify: `src/lib/money.test.ts`

**Interfaces:**
- Consomme : rien de nouveau, module déjà autonome.
- Produit : `parseNonNegativeAmount(input: string): number | null`, consommée par la Task 8 (`savings-goal-form.tsx`) pour le champ « montant actuel ». `parseAmount` existant reste inchangé et sert au champ « montant cible ».

`parseAmount('0')` renvoie `null` (testé dans `money.test.ts`) : il refuse tout montant nul ou négatif, ce qui convient à une transaction ou un plafond de budget, mais pas au montant actuel d'un objectif — un objectif commence souvent à 0 €. D'où cette fonction sœur, qui n'accepte que `>= 0` au lieu de `> 0`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `src/lib/money.test.ts` :

```ts
describe('parseNonNegativeAmount', () => {
  it('accepte zero', () => {
    expect(parseNonNegativeAmount('0')).toBe(0);
  });

  it('accepte une decimale avec virgule', () => {
    expect(parseNonNegativeAmount('24,90')).toBe(24.9);
  });

  it('refuse un montant negatif', () => {
    expect(parseNonNegativeAmount('-10')).toBeNull();
  });

  it('refuse plus de deux decimales', () => {
    expect(parseNonNegativeAmount('10,999')).toBeNull();
  });

  it('refuse une saisie non numerique', () => {
    expect(parseNonNegativeAmount('douze')).toBeNull();
  });

  it('refuse un montant hors bornes', () => {
    expect(parseNonNegativeAmount('12345678901')).toBeNull();
  });
});
```

Ajouter `parseNonNegativeAmount` à l'import en haut du fichier :

```ts
import {
  formatAmount,
  formatBalance,
  formatDelta,
  formatSigned,
  parseAmount,
  parseNonNegativeAmount,
} from '@/lib/money';
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `npx jest src/lib/money.test.ts`
Expected: FAIL — `parseNonNegativeAmount` n'existe pas encore (`TypeError` ou erreur de module).

- [ ] **Step 3: Implémenter**

Dans `src/lib/money.ts`, juste après `parseAmount` :

```ts
/**
 * Comme parseAmount, mais accepte zero — un objectif d'epargne commence
 * parfois a 0 €, contrairement a une transaction ou un plafond de budget.
 */
export function parseNonNegativeAmount(input: string): number | null {
  const normalised = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) {
    return null;
  }

  const value = Number(normalised);
  if (value < 0 || value > MAX_AMOUNT) {
    return null;
  }

  return value;
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `npx jest src/lib/money.test.ts`
Expected: PASS, tous les tests du fichier (anciens et nouveaux).

- [ ] **Step 5: Vérifier l'ensemble**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: propre partout, suite Jest complète au vert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts
git commit -m "feat: parseNonNegativeAmount pour le montant actuel d'un objectif

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Couche donnée `src/data/savings-goals.ts`

**Files:**
- Create: `src/data/savings-goals.ts`

**Interfaces:**
- Consomme : `supabase` (`@/lib/supabase`), `Tables<'savings_goals'>` (`@/types/database`, déjà généré).
- Produit : `SavingsGoal`, `CreateSavingsGoalInput`, `UpdateSavingsGoalInput`, `listSavingsGoals()`, `createSavingsGoal(input)`, `updateSavingsGoal(id, patch)`, `deleteSavingsGoal(id)`. `SavingsGoal` est le type canonique : la Task 4 l'importe d'ici plutôt que de le redéfinir, comme `budget-progress.ts` importe `BudgetWithCategory` de `data/budgets.ts`. Consommés par les Tasks 4 et 6.

Pas de test dédié : ce module n'est qu'un appel PostgREST direct, dans le même style que `src/data/budgets.ts`, et la sécurité réelle est déjà prouvée par la Task 1.

- [ ] **Step 1: Écrire le fichier**

```ts
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type SavingsGoal = Tables<'savings_goals'>;

/**
 * Objectifs de l'utilisateur courant.
 *
 * Pas de filtre `.eq('user_id', …)` : la policy `savings_goals_all_own`
 * (`user_id = auth.uid()`) ne renvoie déjà que les lignes de l'appelant. Un
 * filtre client redondant suggérerait à tort que la sécurité vit ici.
 */
export async function listSavingsGoals(): Promise<SavingsGoal[]> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export type CreateSavingsGoalInput = {
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
};

export type UpdateSavingsGoalInput = {
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
};

export async function createSavingsGoal(input: CreateSavingsGoalInput): Promise<SavingsGoal> {
  const { data, error } = await supabase
    .from('savings_goals')
    .insert({
      // La policy savings_goals_all_own exige user_id = auth.uid() : cette
      // valeur est vérifiée en base, pas seulement ici.
      user_id: input.userId,
      name: input.name,
      target_amount: input.targetAmount,
      current_amount: input.currentAmount,
      target_date: input.targetDate,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateSavingsGoal(
  id: string,
  patch: UpdateSavingsGoalInput
): Promise<SavingsGoal> {
  const { data, error } = await supabase
    .from('savings_goals')
    .update({
      name: patch.name,
      target_amount: patch.targetAmount,
      current_amount: patch.currentAmount,
      target_date: patch.targetDate,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteSavingsGoal(id: string): Promise<void> {
  // .select().single() force une erreur si RLS a filtré la ligne visée (id
  // erroné, appartenance périmée) : sans lui, zéro ligne supprimée serait
  // encore un succès silencieux.
  const { error } = await supabase
    .from('savings_goals')
    .delete()
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
git add src/data/savings-goals.ts
git commit -m "feat: couche donnee des objectifs d'epargne

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Module pur `src/lib/savings-progress.ts`

**Files:**
- Create: `src/lib/savings-progress.ts`
- Create: `src/lib/savings-progress.test.ts`

**Interfaces:**
- Consomme : `SavingsGoal` de `@/data/savings-goals` (Task 3) — importé, jamais redéfini.
- Produit : `SavingsStatus`, `SavingsProgress`, `savingsProgress(goal): SavingsProgress` — consommés par les Tasks 7, 9 et 10 (ligne, écrans, entrée de tableau de bord).

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { savingsProgress } from '@/lib/savings-progress';
import type { SavingsGoal } from '@/data/savings-goals';

function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    name: 'Vacances',
    target_amount: 1000,
    current_amount: 250,
    target_date: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('savingsProgress', () => {
  it('calcule le pourcentage arrondi', () => {
    const result = savingsProgress(goal({ target_amount: 1000, current_amount: 250 }));
    expect(result.percent).toBe(25);
    expect(result.status).toBe('in_progress');
  });

  it('passe en atteint pile a 100 %', () => {
    const result = savingsProgress(goal({ target_amount: 500, current_amount: 500 }));
    expect(result.percent).toBe(100);
    expect(result.status).toBe('reached');
  });

  it('depasse 100 % dans le texte, sans etre plafonne par le calcul', () => {
    const result = savingsProgress(goal({ target_amount: 200, current_amount: 290 }));
    expect(result.percent).toBe(145);
    expect(result.status).toBe('reached');
  });

  it(`rend 0 % quand rien n'est encore epargne`, () => {
    const result = savingsProgress(goal({ target_amount: 300, current_amount: 0 }));
    expect(result.percent).toBe(0);
    expect(result.status).toBe('in_progress');
  });

  it('arrondit au plus proche', () => {
    const result = savingsProgress(goal({ target_amount: 300, current_amount: 100 }));
    expect(result.percent).toBe(33);
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx jest src/lib/savings-progress.test.ts`
Expected: FAIL — le module `@/lib/savings-progress` n'existe pas.

- [ ] **Step 3: Implémenter**

```ts
import type { SavingsGoal } from '@/data/savings-goals';

export type SavingsStatus = 'in_progress' | 'reached';

export type SavingsProgress = {
  goal: SavingsGoal;
  /** Peut depasser 100 : c'est l'affichage qui plafonne la barre, pas le calcul. */
  percent: number;
  status: SavingsStatus;
};

/**
 * Progression d'un objectif d'epargne.
 *
 * `target_amount > 0` est garanti par la contrainte `check` de la table :
 * pas de garde contre la division par zero, elle serait du code mort.
 *
 * Pas de palier d'alerte façon budgets (80 %/100 %) : la spec 2.5 ne demande
 * qu'une barre ou un pourcentage, contrairement a la spec 2.4 qui fixe des
 * seuils explicites pour les budgets.
 */
export function savingsProgress(goal: SavingsGoal): SavingsProgress {
  const percent = Math.round((goal.current_amount / goal.target_amount) * 100);
  const status: SavingsStatus =
    goal.current_amount >= goal.target_amount ? 'reached' : 'in_progress';

  return { goal, percent, status };
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `npx jest src/lib/savings-progress.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Vérifier l'ensemble**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: propre partout.

- [ ] **Step 6: Commit**

```bash
git add src/lib/savings-progress.ts src/lib/savings-progress.test.ts
git commit -m "feat: calcul pur de la progression d'un objectif d'epargne

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `DateField` accepte une borne basse (`minimumDate`)

**Files:**
- Modify: `src/components/transaction/date-field-props.ts`
- Modify: `src/components/transaction/date-field.tsx`
- Modify: `src/components/transaction/date-field.web.tsx`

**Interfaces:**
- Consomme : rien de nouveau — `@react-native-community/datetimepicker` accepte déjà une prop `minimumDate`, symétrique de `maximumDate` (vérifié dans `node_modules/@react-native-community/datetimepicker/src/index.d.ts`).
- Produit : `DateFieldProps.minimumDate?: Date`, consommée par la Task 8 (`savings-goal-form.tsx`, échéance). `transaction-form.tsx` continue de passer `maximumDate` seul, sans changement de comportement.

Pas de TDD ici : ni `DateField` ni sa variante web n'ont de test dans ce projet (aucun composant n'en a). Vérification par tsc, lint et export.

- [ ] **Step 1: Élargir le type partagé**

Dans `src/components/transaction/date-field-props.ts`, remplacer le contenu par :

```ts
/**
 * Props partagées entre les deux variantes de DateField (native et web).
 *
 * Extrait dans son propre module plutôt que dupliqué : nommer ce fichier
 * autrement que `date-field.*` lui évite de participer à la résolution de
 * plateforme de Metro, qui ne regarde que le nom du fichier du composant.
 */
export type DateFieldProps = {
  /** Date choisie, au format ISO `YYYY-MM-DD`. */
  value: string;
  /** Texte déjà formaté à afficher (« Aujourd'hui », « Hier », ...). */
  label: string;
  onChange: (iso: string) => void;
  /** Borne haute du sélecteur : pas d'opération future dans un suivi de dépenses. */
  maximumDate?: Date;
  /** Borne basse : une échéance d'objectif d'épargne va dans l'autre sens. */
  minimumDate?: Date;
};
```

- [ ] **Step 2: Passer la borne au sélecteur natif**

Dans `src/components/transaction/date-field.tsx`, changer la signature et l'appel à `DateTimePicker` :

```tsx
export function DateField({ value, label, onChange, maximumDate, minimumDate }: DateFieldProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Date : ${label}`}
        onPress={() => setOpen(true)}
        style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
      </Pressable>

      {open ? (
        <DateTimePicker
          value={isoToDate(value)}
          mode="date"
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={(_event, date) => {
            setOpen(false);
            if (date) {
              onChange(dateToIso(date));
            }
          }}
        />
      ) : null}
    </>
  );
}
```

(Seule la ligne de signature et l'ajout de `minimumDate={minimumDate}` changent ; le reste du fichier, y compris les styles, ne bouge pas.)

- [ ] **Step 3: Passer la borne à l'input web**

Dans `src/components/transaction/date-field.web.tsx`, changer la signature et l'attribut `min` :

```tsx
export function DateField({ value, label, onChange, maximumDate, minimumDate }: DateFieldProps) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.surface, borderColor: focused ? colors.primary : colors.border },
      ]}
    >
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
      <input
        type="date"
        aria-label={`Date : ${label}`}
        value={value}
        max={maximumDate ? dateToIso(maximumDate) : undefined}
        min={minimumDate ? dateToIso(minimumDate) : undefined}
        onChange={(event) => {
          if (event.target.value) {
            onChange(event.target.value);
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={overlayStyle}
      />
    </View>
  );
}
```

(Seules la ligne de signature et les attributs `max`/`min` changent ; le reste, y compris `overlayStyle` et `styles`, ne bouge pas.)

- [ ] **Step 4: Vérifier**

Run: `npx tsc --noEmit && npm run lint`
Expected: propre. `transaction-form.tsx` n'est pas modifié et continue de compiler : il passe toujours `maximumDate={new Date()}` sans `minimumDate`, ce qui reste valide puisque les deux props sont désormais optionnelles.

- [ ] **Step 5: Commit**

```bash
git add src/components/transaction/date-field-props.ts src/components/transaction/date-field.tsx src/components/transaction/date-field.web.tsx
git commit -m "feat: DateField accepte une borne basse minimumDate

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Clé de cache et hooks

**Files:**
- Modify: `src/lib/query-keys.ts`
- Create: `src/hooks/use-savings-goals.ts`
- Create: `src/hooks/use-savings-goal-mutations.ts`
- Create: `src/hooks/use-savings-goals-realtime.ts`

**Interfaces:**
- Consomme : `queryKeys` (à étendre), `src/data/savings-goals.ts` (Task 3), `useAuth()` (`@/hooks/use-auth`).
- Produit :
  - `queryKeys.savingsGoals(): ['savingsGoals']`
  - `useSavingsGoals(): { goals: SavingsGoal[]; isLoading: boolean; error: unknown; isLoadingError: boolean }`
  - `useSavingsGoalMutations(): { createGoal, updateGoal, deleteGoal, isSaving, isDeleting }`
  - `useSavingsGoalsRealtime(): void`

  Consommés par les Tasks 9 et 10 (écrans, entrée de tableau de bord) et par le montage dans `(app)/_layout.tsx` (Task 9).

- [ ] **Step 1: Ajouter la clé de cache**

À la fin de l'objet `queryKeys` dans `src/lib/query-keys.ts`, après `activity` :

```ts
  // Portée personnelle, pas de groupe : une seule clé, sans le couple
  // racine/groupe des budgets. La policy ne renvoie déjà que les objectifs de
  // l'appelant, et useClearCacheOnUserChange() vide tout le cache au
  // changement de compte — il n'existe pas d'équivalent « objectif actif »
  // dont une invalidation devrait se méfier.
  savingsGoals: () => ['savingsGoals'] as const,
```

- [ ] **Step 2: Écrire le hook de lecture**

`src/hooks/use-savings-goals.ts` :

```ts
import { useQuery } from '@tanstack/react-query';

import { listSavingsGoals, type SavingsGoal } from '@/data/savings-goals';
import { queryKeys } from '@/lib/query-keys';

/** Objectifs de l'utilisateur courant. Sans paramètre : voir savings-goals.ts. */
export function useSavingsGoals(): {
  goals: SavingsGoal[];
  isLoading: boolean;
  error: unknown;
  /** Vrai seulement si aucune lecture n'a jamais abouti. */
  isLoadingError: boolean;
} {
  const { data, isLoading, error, isLoadingError } = useQuery({
    queryKey: queryKeys.savingsGoals(),
    queryFn: listSavingsGoals,
  });

  return { goals: data ?? [], isLoading, error, isLoadingError };
}
```

- [ ] **Step 3: Écrire le hook de mutation**

`src/hooks/use-savings-goal-mutations.ts` :

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createSavingsGoal,
  deleteSavingsGoal,
  updateSavingsGoal,
  type CreateSavingsGoalInput,
  type UpdateSavingsGoalInput,
} from '@/data/savings-goals';
import { queryKeys } from '@/lib/query-keys';

/** Création, modification et suppression d'un objectif d'épargne. */
export function useSavingsGoalMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.savingsGoals() });
  }

  const createGoal = useMutation({
    mutationFn: (input: CreateSavingsGoalInput) => createSavingsGoal(input),
    onSuccess: invalidate,
  });

  const updateGoal = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSavingsGoalInput }) =>
      updateSavingsGoal(id, patch),
    onSuccess: invalidate,
  });

  const deleteGoal = useMutation({
    mutationFn: (id: string) => deleteSavingsGoal(id),
    onSuccess: invalidate,
  });

  return {
    createGoal,
    updateGoal,
    deleteGoal,
    // Deux indicateurs distincts, comme pour les transactions et les budgets :
    // un seul agrégé faisait tourner le bouton Supprimer pendant l'enregistrement.
    isSaving: createGoal.isPending || updateGoal.isPending,
    isDeleting: deleteGoal.isPending,
  };
}
```

- [ ] **Step 4: Écrire le hook Realtime**

`src/hooks/use-savings-goals-realtime.ts` :

```ts
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/**
 * Sync temps réel des objectifs d'épargne de l'utilisateur courant.
 *
 * Deux abonnements, comme use-budgets-realtime.ts et pour la même raison :
 * aucune table du projet n'a de `replica identity full` (vérifié dans les
 * migrations), donc l'ancien tuple d'un DELETE ne porte que l'id, jamais
 * user_id — un filtre serveur sur user_id ne peut donc jamais le matcher. Le
 * second abonnement, sans filtre serveur, se contente d'invalider ; RLS
 * s'applique aux deux, ce n'est qu'une économie de trafic.
 */
export function useSavingsGoalsRealtime(): void {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) {
      return;
    }

    function invalidate() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savingsGoals() });
    }

    const channel = supabase
      .channel(`savings-goals:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'savings_goals',
          filter: `user_id=eq.${userId}`,
        },
        invalidate
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'savings_goals' },
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
  }, [userId, queryClient]);
}
```

- [ ] **Step 5: Vérifier**

Run: `npx tsc --noEmit && npm run lint`
Expected: propre.

- [ ] **Step 6: Commit**

```bash
git add src/lib/query-keys.ts src/hooks/use-savings-goals.ts src/hooks/use-savings-goal-mutations.ts src/hooks/use-savings-goals-realtime.ts
git commit -m "feat: hooks de lecture, mutation et temps reel des objectifs d'epargne

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `SavingsGoalRow`

**Files:**
- Create: `src/components/savings/savings-goal-row.tsx`

**Interfaces:**
- Consomme : `SavingsProgress` (Task 4).
- Produit : `SavingsGoalRow({ item, onPress })` — consommé par la Task 9 (`savings-goals.tsx`).

- [ ] **Step 1: Écrire le composant**

```tsx
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { SavingsProgress } from '@/lib/savings-progress';
import { formatAmount } from '@/lib/money';
import { font, radius, spacing, stackAtFontScale, useColors } from '@/theme/tokens';

/** Le texte dit ce que la couleur dit : un daltonien lit la même information. */
function statusText(item: SavingsProgress): string {
  if (item.status === 'reached') {
    return 'Atteint';
  }
  const remaining = item.goal.target_amount - item.goal.current_amount;
  return `Il reste ${formatAmount(remaining)} €`;
}

export function SavingsGoalRow({
  item,
  onPress,
}: {
  item: SavingsProgress;
  onPress: () => void;
}) {
  const colors = useColors();
  const { fontScale } = useWindowDimensions();

  const barColor = item.status === 'reached' ? colors.positive : colors.primary;
  const percent = item.percent;

  // Au-delà du seuil, le nom et les montants s'empilent plutôt que de se
  // disputer la largeur — même motif que budget-row.tsx.
  const stacked = fontScale >= stackAtFontScale;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.goal.name}, ${formatAmount(item.goal.current_amount)} euros sur ${formatAmount(item.goal.target_amount)} euros, ${percent} %. ${statusText(item)}`}
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.head, stacked && styles.headStacked]}>
        <Text style={[styles.name, { color: colors.text }]}>{item.goal.name}</Text>
        <Text style={[styles.amounts, { color: colors.textMuted }]}>
          {formatAmount(item.goal.current_amount)} / {formatAmount(item.goal.target_amount)} €
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
        <View
          style={[
            styles.bar,
            {
              // Plafonnée à 100 % de la piste, plancher à 2 % dès qu'il y a
              // quelque chose — même motif que budget-row.tsx.
              width: `${item.goal.current_amount === 0 ? 0 : Math.min(Math.max(percent, 2), 100)}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>

      <Text
        style={[
          styles.status,
          { color: item.status === 'reached' ? colors.positive : colors.textMuted },
        ]}
      >
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
  headStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
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

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit && npm run lint`
Expected: propre.

- [ ] **Step 3: Commit**

```bash
git add src/components/savings/savings-goal-row.tsx
git commit -m "feat: ligne d'objectif d'epargne avec barre de progression

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: `SavingsGoalForm`

**Files:**
- Create: `src/components/savings/savings-goal-form.tsx`

**Interfaces:**
- Consomme : `AmountInput` (`@/components/transaction/amount-input`), `DateField` (Task 5), `Button` (`@/components/ui/button`), `parseAmount` + `parseNonNegativeAmount` (Task 2), `formatOccurredOn` (`@/lib/dates`, réutilisé tel quel pour l'échéance — son repli générique convient à une date future comme à une date passée).
- Produit : `SavingsGoalFormValues`, `SavingsGoalForm({ initialValues, submitLabel, submitting, deleting, errorText, onSubmit, onDelete })` — consommé par la Task 9 (`savings-goal.tsx`).

- [ ] **Step 1: Écrire le composant**

```tsx
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AmountInput } from '@/components/transaction/amount-input';
import { DateField } from '@/components/transaction/date-field';
import { Button } from '@/components/ui/button';
import { formatOccurredOn, todayIso } from '@/lib/dates';
import { parseAmount, parseNonNegativeAmount } from '@/lib/money';
import { font, radius, spacing, useColors } from '@/theme/tokens';

export type SavingsGoalFormValues = {
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
};

type SavingsGoalFormProps = {
  initialValues?: SavingsGoalFormValues;
  submitLabel: string;
  submitting: boolean;
  deleting: boolean;
  errorText?: string;
  onSubmit: (values: SavingsGoalFormValues) => void;
  onDelete?: () => void;
};

export function SavingsGoalForm({
  initialValues,
  submitLabel,
  submitting,
  deleting,
  errorText,
  onSubmit,
  onDelete,
}: SavingsGoalFormProps) {
  const colors = useColors();

  const [name, setName] = useState(initialValues?.name ?? '');
  const [targetAmountText, setTargetAmountText] = useState(
    initialValues ? initialValues.targetAmount.toFixed(2).replace('.', ',') : ''
  );
  const [currentAmountText, setCurrentAmountText] = useState(
    initialValues ? initialValues.currentAmount.toFixed(2).replace('.', ',') : '0,00'
  );
  const [hasTargetDate, setHasTargetDate] = useState(initialValues?.targetDate != null);
  const [targetDate, setTargetDate] = useState(initialValues?.targetDate ?? todayIso());
  const [touched, setTouched] = useState(false);
  // Deuxième étape de confirmation avant suppression, même motif que
  // budget-form.tsx : pas de dépendance à Alert.alert, qui ne fait rien sur web.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const targetAmount = parseAmount(targetAmountText);
  const currentAmount = parseNonNegativeAmount(currentAmountText);
  // target_amount > 0 et current_amount >= 0 sont des contraintes de la
  // base : les refuser ici évite un aller-retour réseau pour apprendre ce
  // qu'on sait déjà.
  const valid = name.trim() !== '' && targetAmount !== null && currentAmount !== null;

  function handleSubmit() {
    setTouched(true);
    if (!valid) {
      return;
    }
    onSubmit({
      name: name.trim(),
      targetAmount: targetAmount as number,
      currentAmount: currentAmount as number,
      targetDate: hasTargetDate ? targetDate : null,
    });
  }

  return (
    <View style={styles.form}>
      <TextInput
        accessibilityLabel="Nom de l’objectif"
        placeholder="Vacances, voiture, urgence…"
        placeholderTextColor={colors.textMuted}
        value={name}
        onChangeText={setName}
        style={[
          styles.name,
          { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
        ]}
      />

      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Montant cible</Text>
        <AmountInput value={targetAmountText} onChangeText={setTargetAmountText} autoFocus />
      </View>

      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Montant actuel</Text>
        <AmountInput value={currentAmountText} onChangeText={setCurrentAmountText} />
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: hasTargetDate }}
        accessibilityLabel="Fixer une échéance"
        onPress={() => setHasTargetDate((value) => !value)}
        style={styles.toggleRow}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: colors.border,
              backgroundColor: hasTargetDate ? colors.primary : 'transparent',
            },
          ]}
        >
          {hasTargetDate ? (
            <Text style={[styles.checkmark, { color: colors.primaryText }]}>✓</Text>
          ) : null}
        </View>
        <Text style={[styles.toggleLabel, { color: colors.text }]}>Fixer une échéance</Text>
      </Pressable>

      {hasTargetDate ? (
        <DateField
          value={targetDate}
          label={formatOccurredOn(targetDate)}
          onChange={setTargetDate}
          minimumDate={new Date()}
        />
      ) : null}

      {touched && !valid ? (
        <Text style={[styles.error, { color: colors.danger }]}>
          Donnez un nom et un montant cible supérieur à zéro.
        </Text>
      ) : null}

      {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

      <Button title={submitLabel} loading={submitting} disabled={deleting} onPress={handleSubmit} />

      {onDelete ? (
        confirmingDelete ? (
          <View style={styles.deleteRow}>
            <Button
              title="Confirmer la suppression"
              variant="danger"
              loading={deleting}
              disabled={submitting || deleting}
              accessibilityLabel="Confirmer la suppression définitive de cet objectif"
              onPress={onDelete}
            />
            <Button
              title="Annuler"
              variant="ghost"
              disabled={submitting || deleting}
              onPress={() => setConfirmingDelete(false)}
            />
          </View>
        ) : (
          <Button
            title="Supprimer"
            variant="ghost"
            loading={deleting}
            disabled={submitting || deleting}
            onPress={() => setConfirmingDelete(true)}
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  block: {
    gap: spacing.sm,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 10.5,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontFamily: font.bold,
    fontSize: 14,
  },
  toggleLabel: {
    fontFamily: font.medium,
    fontSize: 14,
  },
  deleteRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 13,
  },
});
```

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit && npm run lint`
Expected: propre.

- [ ] **Step 3: Commit**

```bash
git add src/components/savings/savings-goal-form.tsx
git commit -m "feat: formulaire de creation et edition d'un objectif d'epargne

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Écrans liste et fiche

**Files:**
- Create: `src/app/(app)/savings-goals.tsx`
- Create: `src/app/(app)/savings-goal.tsx`
- Modify: `src/app/(app)/_layout.tsx`

**Interfaces:**
- Consomme : `useSavingsGoals`, `useSavingsGoalMutations`, `useSavingsGoalsRealtime` (Task 6), `SavingsGoalRow` (Task 7), `SavingsGoalForm` (Task 8), `savingsProgress` (Task 4), `useAuth` (`@/hooks/use-auth`), `Screen` (`@/components/ui/screen`), `Button` (`@/components/ui/button`).
- Produit : routes `/savings-goals` (liste) et `/savings-goal` (`?id=` pour éditer, sans paramètre pour créer).

- [ ] **Step 1: Écrire l'écran liste**

`src/app/(app)/savings-goals.tsx` :

```tsx
import { Link, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SavingsGoalRow } from '@/components/savings/savings-goal-row';
import { Screen } from '@/components/ui/screen';
import { useSavingsGoals } from '@/hooks/use-savings-goals';
import { dataErrorMessage } from '@/lib/data-errors';
import { savingsProgress } from '@/lib/savings-progress';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

/**
 * Objectifs d'épargne (spec 2.5, écran 6).
 *
 * Portée personnelle : useSavingsGoals() ne prend aucun paramètre de groupe,
 * la policy RLS ne renvoie déjà que les objectifs de l'utilisateur courant.
 */
export default function SavingsGoalsScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const router = useRouter();
  const { goals, isLoading, error, isLoadingError } = useSavingsGoals();

  const items = useMemo(() => goals.map(savingsProgress), [goals]);

  // Seul l'échec du tout premier chargement bloque l'écran : TanStack garde
  // les dernières données valides après un rafraîchissement raté en
  // arrière-plan — même règle que budgets.tsx et activity.tsx.
  const blockingError: unknown = isLoadingError ? error : null;

  return (
    <Screen
      align="top"
      floatingAction={
        <Link href="/savings-goal" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter un objectif"
            // Aplati : <Link asChild> transmet le style à son enfant via un
            // Slot, qui lève une erreur de rendu en développement s'il reçoit
            // un tableau.
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
        <Text style={[styles.title, { color: colors.text }]}>Objectifs d’épargne</Text>
      </View>

      {blockingError ? (
        <Text style={[styles.message, { color: colors.danger }]}>
          {dataErrorMessage(blockingError)}
        </Text>
      ) : isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : items.length === 0 ? (
        <Text style={[styles.message, { color: colors.textMuted }]}>
          Aucun objectif défini. Touchez + pour en créer un.
        </Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <SavingsGoalRow
              key={item.goal.id}
              item={item}
              onPress={() => router.push(`/savings-goal?id=${item.goal.id}`)}
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

- [ ] **Step 2: Écrire l'écran de création/édition**

`src/app/(app)/savings-goal.tsx` :

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  SavingsGoalForm,
  type SavingsGoalFormValues,
} from '@/components/savings/savings-goal-form';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useSavingsGoalMutations } from '@/hooks/use-savings-goal-mutations';
import { useSavingsGoals } from '@/hooks/use-savings-goals';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Une seule route pour les deux modes : création sans paramètre, édition
 * avec ?id=. Même parti que budget.tsx et transaction.tsx.
 */
export default function SavingsGoalScreen() {
  const colors = useColors();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { goals, isLoading, error } = useSavingsGoals();
  const { createGoal, updateGoal, deleteGoal, isSaving, isDeleting } = useSavingsGoalMutations();
  const [errorText, setErrorText] = useState<string>();

  const existing = typeof id === 'string' ? goals.find((goal) => goal.id === id) : undefined;

  // Tous les hooks ci-dessus s'exécutent à chaque rendu ; les retours
  // conditionnels qui suivent n'en court-circuitent aucun.
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // En pratique toujours vrai ici : les routes (app) ne sont atteignables
  // qu'avec une session (garde Stack.Protected du layout racine). Ce garde
  // évite une assertion non sûre plutôt que de documenter un cas impossible.
  if (error || !userId) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          {error ? dataErrorMessage(error) : 'Session introuvable.'}
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  // L'objectif visé n'est plus dans la liste : supprimé pendant que la
  // feuille était ouverte (un autre appareil du même compte), ou identifiant
  // périmé. Sans ce garde, le formulaire s'ouvrirait vide sous « Modifier ».
  if (typeof id === 'string' && !existing) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          Cet objectif n’existe plus.
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  function handleSubmit(values: SavingsGoalFormValues) {
    setErrorText(undefined);

    if (existing) {
      updateGoal.mutate(
        { id: existing.id, patch: values },
        {
          onSuccess: () => router.back(),
          onError: (mutationError) => setErrorText(dataErrorMessage(mutationError)),
        }
      );
      return;
    }

    createGoal.mutate(
      { ...values, userId: userId as string },
      {
        onSuccess: () => router.back(),
        onError: (mutationError) => setErrorText(dataErrorMessage(mutationError)),
      }
    );
  }

  function handleDelete() {
    if (!existing) {
      return;
    }
    deleteGoal.mutate(existing.id, {
      onSuccess: () => router.back(),
      onError: (mutationError) => setErrorText(dataErrorMessage(mutationError)),
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
          {existing ? 'Modifier l’objectif' : 'Nouvel objectif'}
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
        <SavingsGoalForm
          initialValues={
            existing
              ? {
                  name: existing.name,
                  targetAmount: existing.target_amount,
                  currentAmount: existing.current_amount,
                  targetDate: existing.target_date,
                }
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

- [ ] **Step 3: Enregistrer les routes et monter le temps réel**

Remplacer le contenu de `src/app/(app)/_layout.tsx` par :

```tsx
import { Stack } from 'expo-router';

import { useBudgetsRealtime } from '@/hooks/use-budgets-realtime';
import { useSavingsGoalsRealtime } from '@/hooks/use-savings-goals-realtime';
import { useTransactionsRealtime } from '@/hooks/use-transactions-realtime';
import { ActiveGroupProvider } from '@/providers/active-group-provider';

export default function AppLayout() {
  return (
    <ActiveGroupProvider>
      <AppStack />
    </ActiveGroupProvider>
  );
}

// Composant séparé : useTransactionsRealtime() et useBudgetsRealtime()
// consomment le contexte de ActiveGroupProvider via useActiveGroup(), donc
// ils doivent être montés sous le provider, pas à côté.
// useSavingsGoalsRealtime() n'en a pas besoin (portée utilisateur, pas
// groupe) mais reste monté ici, à côté de ses deux voisins, plutôt que
// dispersé dans un autre layout pour une raison purement technique.
function AppStack() {
  useTransactionsRealtime();
  useBudgetsRealtime();
  useSavingsGoalsRealtime();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="history" />
      <Stack.Screen name="activity" />
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
      <Stack.Screen name="savings-goals" />
      <Stack.Screen
        name="savings-goal"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
        }}
      />
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

- [ ] **Step 4: Vérifier**

Run: `npx tsc --noEmit && npm run lint && npm test`

Si `tsc` refuse `href="/savings-goal"` ou `href="/savings-goals"` (typedRoutes pas encore régénéré) : lancer `npx expo start` une fois en arrière-plan pour régénérer `.expo/types/router.d.ts`, puis l'arrêter, puis relancer `npx tsc --noEmit`.

Expected : propre, Jest toujours au vert (aucun test existant ne touche ces fichiers).

Run ensuite : `npx expo export --platform android --output-dir <dossier scratch>`
Expected : export réussi. En cas d'échec natif de `hermesc.exe` sans erreur JS/TS, relancer une fois dans un nouveau dossier avant de conclure à un vrai problème.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/savings-goals.tsx" "src/app/(app)/savings-goal.tsx" "src/app/(app)/_layout.tsx"
git commit -m "feat: ecrans liste et fiche des objectifs d'epargne

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Entrée du tableau de bord et vérification manuelle

**Files:**
- Create: `src/components/dashboard/savings-entry.tsx`
- Modify: `src/app/(app)/index.tsx`

**Interfaces:**
- Consomme : `useSavingsGoals` (Task 6), `savingsProgress` (Task 4).
- Produit : `<SavingsEntry />`, monté sur le tableau de bord juste après `<BudgetsEntry />`.

- [ ] **Step 1: Écrire le composant**

`src/components/dashboard/savings-entry.tsx` :

```tsx
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useSavingsGoals } from '@/hooks/use-savings-goals';
import { savingsProgress } from '@/lib/savings-progress';
import { font, radius, spacing, stackAtFontScale, useColors } from '@/theme/tokens';

/**
 * Résume les objectifs d'épargne en une phrase.
 *
 * Même formule que BudgetsEntry, avec une seule dimension (atteint ou non)
 * au lieu de deux (dépassé/proche) : la spec 2.5 ne demande pas de palier
 * d'alerte comme la 2.4 le fait pour les budgets.
 */
function summarise(total: number, reached: number): string {
  if (total === 0) {
    return 'À définir';
  }
  const base = total === 1 ? '1 objectif suivi' : `${total} objectifs suivis`;
  if (reached === 0) {
    return base;
  }
  return `${base}, ${reached === 1 ? '1 atteint' : `${reached} atteints`}`;
}

export function SavingsEntry() {
  const colors = useColors();
  const { fontScale } = useWindowDimensions();
  const { goals, isLoading, error } = useSavingsGoals();

  const items = goals.map(savingsProgress);
  const reached = items.filter((item) => item.status === 'reached').length;

  // Au-delà du seuil, le libellé et le détail s'empilent plutôt que de se
  // disputer la largeur — comme les autres rangées à deux colonnes du projet.
  const stacked = fontScale >= stackAtFontScale;

  const accent = reached > 0 ? colors.positive : colors.textMuted;
  // TanStack Query garde les dernières données valides quand un refetch en
  // arrière-plan échoue : tant que `goals` contient quelque chose, on montre
  // l'état du dernier succès plutôt qu'un « Voir » neutre — même motif que
  // BudgetsEntry.
  const detail =
    (isLoading || error) && goals.length === 0 ? 'Voir' : summarise(items.length, reached);

  return (
    <Link href="/savings-goals" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Objectifs d’épargne. ${detail}`}
        // Aplati : <Link asChild> transmet le style à son enfant via un Slot,
        // qui lève une erreur de rendu en développement s'il reçoit un tableau.
        style={StyleSheet.flatten([
          styles.row,
          stacked && styles.rowStacked,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ])}
      >
        <View style={styles.left}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={[styles.label, { color: colors.text }]}>Objectifs d’épargne</Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.detail, { color: accent }]}>{detail}</Text>
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
  rowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
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

- [ ] **Step 2: Monter l'entrée sur le tableau de bord**

Dans `src/app/(app)/index.tsx`, ajouter l'import (ordre alphabétique des imports `@/components/dashboard/`, donc juste après celui de `RecentTransactions`) :

```tsx
import { SavingsEntry } from '@/components/dashboard/savings-entry';
```

Puis, juste après `<BudgetsEntry />` :

```tsx
      <BudgetsEntry />

      <SavingsEntry />
```

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: propre, Jest toujours au vert.

Run: `npx expo export --platform android --output-dir <dossier scratch>`
Expected: export réussi.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/savings-entry.tsx "src/app/(app)/index.tsx"
git commit -m "feat: entree des objectifs d'epargne sur le tableau de bord

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Vérification manuelle sur appareil (par l'utilisateur)**

Aucun composant ni hook n'a de test automatisé dans ce projet. À vérifier avec `npx expo start --clear` sur téléphone, **en mode développement** (c'est le seul où l'erreur `Slot` se voit) :

1. Tableau de bord : la ligne « Objectifs d’épargne » affiche « À définir » avant toute création.
2. Créer un objectif (nom, montant cible, montant actuel laissé à 0,00 €, sans échéance) : apparaît dans la liste, barre à 0 %.
3. Créer un second objectif avec une échéance : la case cochée fait apparaître le sélecteur de date, plafonné à aujourd'hui ou plus tard.
4. Modifier le montant actuel d'un objectif jusqu'à atteindre la cible : la ligne passe sur « Atteint », en vert (`colors.positive`), et le tableau de bord le reflète (« N objectifs suivis, 1 atteint »).
5. Dépasser la cible : le pourcentage textuel dépasse 100 %, la barre reste pleine.
6. Supprimer un objectif : confirmation à deux étapes, puis disparition de la liste.
7. Lien « Objectifs d’épargne » depuis le tableau de bord, puis bouton retour.
8. Si un second appareil (ou un second onglet Expo Go) est disponible sur le même compte : créer/modifier un objectif sur l'un, vérifier qu'il apparaît sur l'autre sans recharger.
