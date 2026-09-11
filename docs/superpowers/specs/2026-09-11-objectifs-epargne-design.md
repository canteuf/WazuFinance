# Objectifs d'épargne — écran 6

Date : 2026-09-11
Spec de référence : [spec-app-budget.md](../../../spec-app-budget.md) §2.5, écran 6

## Objectif

Permettre à un utilisateur de fixer un objectif d'épargne (nom, montant cible,
montant actuel, échéance optionnelle) et de suivre sa progression — barre et
pourcentage, comme demandé par la spec.

## Décisions cadrées

| Question | Décision | Raison |
|---|---|---|
| Montant actuel | Saisi et modifié à la main | La spec 2.5 décrit la création « avec montant cible et montant actuel » ; « lier des versements » y est une possibilité séparée, plus faible. La calculer depuis les transactions toucherait l'écran 4 (saisie), stable et déjà couvert, pour un besoin que rien ne réclame encore. |
| Portée | Personnelle, jamais partagée | Déjà fixé par le schéma du 4 septembre : `savings_goals.user_id`, policy `savings_goals_all_own`. Même dans un budget partagé, un objectif reste privé — pas de code à écrire pour ça, juste à ne pas le contredire. |
| Journal d'activité | Non suivi | Décision antérieure (tâche journal d'activité) : tables suivies = `transactions` et `budgets` seulement. Pas rouverte ici. |
| Palier d'alerte | Aucun | La spec 2.4 (budgets) fixe 80 %/100 % explicitement ; la spec 2.5 ne demande qu'« une barre ou un pourcentage ». Inventer un palier ajouterait une règle que rien ne réclame. |
| Échéance | Optionnelle, affichée telle quelle | `target_date` est nullable en base. Pas de projection (jours restants, rythme requis) : hors périmètre, voir plus bas. |
| Lien versement → objectif | Différé | `transactions.savings_goal_id` existe déjà en base (nullable, `on delete set null`) mais reste inutilisé par cet écran. Option retenue explicitement face à l'alternative « montant calculé », voir ci-dessus. |

## Modèle de données

Aucune migration de schéma. La table existe depuis le 4 septembre :

```
id, user_id, name, target_amount numeric(12,2) check (> 0),
current_amount numeric(12,2) check (>= 0) default 0, target_date date,
created_at, updated_at
```

RLS : une seule policy, `savings_goals_all_own` (`for all`, `user_id = auth.uid()`
en using et en check). Trigger `savings_goals_touch_updated_at` déjà posé.
Table déjà dans la publication Realtime (`supabase_realtime`).

Seul ajout base de cette tâche : le fichier pgTAP qui manque, voir Tests.

## Composants

### `src/data/savings-goals.ts`

```ts
listSavingsGoals(): Promise<SavingsGoal[]>
createSavingsGoal(input: CreateSavingsGoalInput): Promise<SavingsGoal>
updateSavingsGoal(id: string, patch: UpdateSavingsGoalInput): Promise<SavingsGoal>
deleteSavingsGoal(id: string): Promise<void>
```

`listSavingsGoals()` ne prend **aucun argument** — contrairement à
`listForGroup(groupId)` des budgets. La policy `user_id = auth.uid()` ne
renvoie déjà que les lignes de l'appelant : un utilisateur n'appartient qu'à
un seul « lui-même », là où il appartient à plusieurs groupes. Ajouter un
`.eq('user_id', …)` côté client serait une sécurité redondante que le projet
n'ajoute pas ailleurs (la règle : la sécurité vit en base).

### Clés de cache

```ts
savingsGoals: () => ['savingsGoals'] as const,
```

Une seule clé, sans le couple racine/groupe des budgets
(`budgetsAll()` / `budgets(groupId)`). Ce couple existe pour les budgets parce
qu'une mutation ou un événement Realtime peut arriver après que l'utilisateur
a changé de **groupe actif** — invalider seulement la clé du groupe actif
viserait alors la mauvaise entrée. Il n'y a pas d'équivalent « objectif actif » :
la seule portée est l'utilisateur, et `useClearCacheOnUserChange()` vide déjà
tout le cache au changement de **compte**. Pas de nesting sous
`['transactions']` non plus : le montant est saisi à la main, pas dérivé.

### `src/lib/savings-progress.ts`

Module pur, sans dépendance framework — couvert par Jest comme
`budget-progress.ts`.

```ts
export type SavingsStatus = 'in_progress' | 'reached';
export type SavingsProgress = {
  goal: SavingsGoal;
  percent: number;   // current / target * 100, arrondi, non plafonné
  status: SavingsStatus;
};
export function savingsProgress(goal: SavingsGoal): SavingsProgress;
```

- `percent` peut dépasser 100 dans le texte ; seule la barre est plafonnée à
  100 % de sa piste — même règle que `budget-progress.ts`.
- Deux statuts seulement, pas de palier d'alerte (voir Décisions cadrées).
  `status = 'reached'` dès que `current_amount >= target_amount`.
- `target_amount > 0` est garanti par la contrainte en base — pas de garde
  contre la division par zéro, l'invariant est noté en commentaire.

### Hooks

- `useSavingsGoals()` — lit `listSavingsGoals()`, pas de paramètre de groupe.
- `useSavingsGoalMutations()` — create/update/delete, invalide
  `queryKeys.savingsGoals()`.
- `useSavingsGoalsRealtime()` — même montage à deux abonnements que
  `useBudgetsRealtime()`, pour la même raison : aucune table du projet n'a de
  `replica identity full` (vérifié dans les migrations), donc l'ancien tuple
  d'un `DELETE` ne porte que la clé primaire et un filtre serveur sur
  `user_id` ne peut jamais le matcher. Un abonnement `*` filtré
  `user_id=eq.<self>` pour insert/update, un abonnement `DELETE` sans filtre
  serveur à côté, RLS s'applique aux deux.

### Écrans

`src/app/(app)/savings-goals.tsx` (liste), calqué sur `budgets.tsx` : en-tête
et bouton retour identiques, erreur bloquante seulement quand rien n'est en
cache (`isLoadingError`, même garde que le correctif du 2026-09-10 sur
`budgets.tsx`), bouton flottant « + ». Chaque ligne : nom, `actuel / cible`,
barre, « Atteint » en mot discret sur la ligne de statut quand
`status === 'reached'` — teinte `colors.positive`, déjà sémantique pour un
succès, pas de nouveau jeton de thème à ajouter (contrairement à `warning`
pour les budgets).

`src/app/(app)/savings-goal.tsx`, route unique `?id=`, en `formSheet` comme
`budget.tsx` : nom, montant cible et montant actuel (`AmountInput` réutilisé
pour les deux), échéance optionnelle. Enregistrer / Supprimer.

`src/components/dashboard/savings-entry.tsx` — ligne d'entrée sur le tableau
de bord, toujours affichée, même formule que `BudgetsEntry` : « À définir »
si aucun objectif ; sinon « N objectifs suivis », avec « , M atteints » ajouté
si `M > 0` (ex. « 3 objectifs suivis, 1 atteint »).

### `DateField` — ajout de `minimumDate`

`DateFieldProps` n'expose aujourd'hui que `maximumDate`
(« pas d'opération future dans un suivi de dépenses », commentaire du
fichier). Une échéance va dans l'autre sens. Ajout d'un champ optionnel :

```ts
export type DateFieldProps = {
  value: string;
  label: string;
  onChange: (iso: string) => void;
  maximumDate?: Date;
  minimumDate?: Date;
};
```

Passé à `DateTimePicker` (natif) et à l'attribut `min` de l'`<input type=date>`
(web). `maximumDate` devient optionnel par cohérence de signature, mais
`transaction-form.tsx` continue de le passer sans changement de comportement.
`savings-goal-form.tsx` passe `minimumDate={new Date()}`, sans `maximumDate`.

Échéance optionnelle : une case à cocher (« Fixer une échéance ») montre ou
cache le `DateField` ; décochée, `targetDate` reste `null`. Pas de champ
obligatoire pour une colonne nullable.

## Tests

**Jest — `savings-progress.test.ts`** : pourcentage arrondi, objectif atteint
pile (`current === target`), dépassé, montant actuel à 0, cible tout juste
positive.

**pgTAP — `savings_goals_rls_test.sql`**, fichier qui manque aujourd'hui : la
table est en place avec sa policy mais aucun test ne l'exerce. Un utilisateur
lit, crée, modifie, supprime ses propres objectifs ; il ne voit ni ne modifie
ceux d'un autre, y compris quand les deux partagent un groupe ; les
contraintes `check` (`target_amount > 0`, `current_amount >= 0`) rejettent
une valeur invalide.

**Non couvert par un test automatisé** : l'écran, le formulaire, la ligne du
tableau de bord — aucun composant ni hook n'a de test JS dans ce projet.
Vérification manuelle sur téléphone.

## Hors périmètre

- **Lier un versement à un objectif** depuis la saisie de transaction —
  `transactions.savings_goal_id` reste inutilisé. Reviendrait comme un
  chantier séparé si le besoin se confirme à l'usage.
- **Journal d'activité** sur `savings_goals`.
- **Palier d'alerte** façon budgets (80 %/100 %).
- **Projection depuis `target_date`** (jours restants, rythme d'épargne
  requis pour tenir l'échéance).
- **Historique des modifications** d'un objectif (montant cible relevé,
  échéance déplacée) — même decision que pour les budgets : pas de table de
  versions pour l'instant.
