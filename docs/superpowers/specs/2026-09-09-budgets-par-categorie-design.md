# Budgets par catégorie — écran 5

Date : 2026-09-09
Spec de référence : [spec-app-budget.md](../../../spec-app-budget.md) §2.4, écran 5

## Objectif

Permettre à un groupe de fixer un plafond de dépense par catégorie et de voir,
en cours de période, ce qui a été consommé — avec une alerte visuelle à 80 % et
à 100 % du plafond.

## Décisions cadrées

| Question | Décision | Raison |
|---|---|---|
| Cadence | Mensuelle seule | Un budget suit la période budgétaire du groupe (`period_start_day`), déjà utilisée par le solde, la répartition et l'historique. L'enum `budget_period` garde `'weekly'` sans qu'on l'expose. |
| Contenu de la liste | Budgets définis seuls | Quatorze catégories par défaut dont deux budgétées : montrer les douze autres noierait la progression, qui est le point de l'écran. |
| Découverte | Dans le formulaire de création | Le sélecteur propose les catégories de dépense sans budget, classées par dépense réelle de la période décroissante : les postes où l'argent part vraiment remontent. |
| Alerte | Écran 5 + bandeau sur le dashboard | Une alerte qu'il faut aller chercher n'alerte personne. La répartition ne convient pas : elle masque la queue au-delà de cinq parts, donc un petit budget explosé y serait invisible. |
| Calcul dépensé/plafond | Réutilise `category_breakdown` | Voir ci-dessous. |

## Calcul de la progression

`category_breakdown(group_id, from, to)` rend déjà le total dépensé par
catégorie sur une période. L'écran lit les budgets et rapproche les deux
ensembles par `category_id`.

**Pourquoi pas une RPC `budget_progress` dédiée** : elle créerait un second
endroit où vit la définition de « dépense de la période », le premier étant
`category_breakdown`. Deux définitions qui doivent rester d'accord, c'est
l'écart qu'on découvre six mois plus tard. Et elle imposerait une migration là
où le besoin est déjà couvert.

**Pourquoi ça ne viole pas la règle « les agrégats se calculent en Postgres »** :
la somme des montants reste faite par Postgres sur du `numeric(12,2)`. Côté
client il ne reste qu'une correspondance par identifiant et une division
`dépensé / plafond` de deux valeurs déjà exactes — ce qui est proscrit, c'est
l'addition de flottants, pas le rapport de deux totaux.

**Effet de bord favorable** : le dashboard tient déjà cette requête en cache
pour la répartition, donc le bandeau d'alerte ne coûte que la lecture des
plafonds.

## Modèle de données

Aucune migration. La table `budgets` existe depuis le schéma initial :

```
id, group_id, category_id, period (enum), amount numeric(12,2) check (amount > 0),
created_at, updated_at, unique (group_id, category_id, period)
```

Ses quatre policies RLS (`budgets_select_member`, `_insert_member`,
`_update_member`, `_delete_member`) sont en place, et la table est dans la
publication Realtime.

`period` est toujours écrit à `'monthly'`.

## Composants

### `src/data/budgets.ts`

`listForGroup(groupId)` lit `select('*, category:categories(id, name, icon)')` —
jointure faite par PostgREST, même motif que les transactions. Plus `create`,
`update`, `remove`.

### `src/lib/budget-progress.ts`

Module pur, sans dépendance framework, donc couvert par Jest comme `money` et
`dates`. C'est là que vivent les seuils de la spec.

```ts
export const WARNING_RATIO = 0.8;
export type BudgetStatus = 'ok' | 'warning' | 'over';
export type BudgetProgress = {
  budget: BudgetWithCategory;
  spent: number;
  remaining: number;
  ratio: number;
  status: BudgetStatus;
};
export function budgetProgress(
  budgets: BudgetWithCategory[],
  slices: CategorySlice[]
): BudgetProgress[];
```

Deux cas tranchés explicitement :

- Une catégorie budgétée sans dépense est **absente** de `category_breakdown`
  (jointure interne) : elle vaut `spent = 0`, pas une ligne manquante.
- Un ratio supérieur à 1 reste vrai dans le texte (« 145 % ») ; seule la barre
  est plafonnée à 100 % de sa piste.

`remaining` vaut `amount - spent` et devient **négatif** en dépassement : le
module rend le nombre signé, c'est l'affichage qui choisit entre « il reste »
et « dépassé de » et prend la valeur absolue.

Le tri est rendu par ce module : dépassements d'abord, puis alertes, puis ratio
décroissant. Ce qui va mal remonte en tête.

`amount > 0` est garanti par la contrainte en base — pas de garde contre la
division par zéro, l'invariant est noté en commentaire plutôt que doublé en
code mort.

### Clés de cache

`queryKeys.budgets(groupId)` = `['budgets', groupId]` — **pas** sous
`['transactions']`. Un budget n'est pas dérivé des transactions : l'y nicher
ferait recharger les plafonds à chaque saisie de dépense, pour rien. C'est la
symétrie inverse de `periodSummary` et `categoryBreakdown`, qui eux en dérivent
et doivent donc y être nichés.

### Hooks

- `useBudgets()` — les budgets du groupe actif.
- `useBudgetProgress()` — compose `useBudgets()` et `useCategoryBreakdown()`,
  qui portent les mêmes bornes de période que le reste du dashboard.
- `useBudgetMutations()` — création, modification, suppression ; invalide
  `queryKeys.budgets(groupId)`.
- `useBudgetsRealtime()` — hook séparé de `useTransactionsRealtime`, monté à
  côté dans `(app)/_layout.tsx`. Un canal, une préoccupation ; le hook des
  transactions porte déjà un long raisonnement sur les DELETE qu'il ne faut pas
  emmêler. Il reprend en revanche le même montage à deux abonnements, pour la
  même raison : `replica identity` n'est pas complète, donc l'ancien tuple d'un
  DELETE ne porte que la clé primaire et le filtre `group_id` ne peut jamais
  correspondre.

### Écrans

`src/app/(app)/budgets.tsx`, enregistré dans le `Stack`. En-tête et bouton
retour calqués sur l'historique. Chaque ligne : catégorie, `dépensé / plafond`,
barre teintée par statut, et le reste en clair — « il reste 45,20 € » ou
« dépassé de 12,00 € ». Appui = édition. Bouton flottant « + » = création.

`src/app/(app)/budget.tsx` en `formSheet`, comme `transaction.tsx` : sélecteur
de catégorie, `AmountInput` réutilisé tel quel, Enregistrer / Supprimer.

À la création, le sélecteur ne propose que les catégories de dépense sans
budget. Ça écarte du même coup la violation d'unicité dans le cas normal ; elle
ne reste possible que si deux membres créent le même budget au même moment.

`src/components/dashboard/budget-alerts.tsx` ne rend rien tant qu'aucun budget
n'est en alerte. Sinon une ligne compacte et touchable menant à `/budgets` :
« 2 budgets dépassés · 1 proche de la limite ».

### Thème

Ajout du jeton `warning` aux deux palettes — `#B7791F` en clair, `#F2B544` en
sombre — choisis pour tenir le contraste sur leur fond respectif. Sémantique
comme `positive`, donc distinct de l'accent `primary`.

### Messages d'erreur

`data-errors.ts` mappe `23505` sur « Cette opération existe déjà. » Le mot est
faux hors du domaine des transactions — lesquelles n'ont d'ailleurs aucune
contrainte d'unicité, donc ce message n'a jamais pu s'afficher. Repointé sur
« Un enregistrement identique existe déjà. »

## Tests

**Jest — `budget-progress.test.ts`** : rapprochement par catégorie, catégorie
budgétée sans dépense, franchissement exact de 80 % et de 100 % (les bornes,
pas seulement les milieux), dépassement au-delà de 100 %, ordre de tri.

**pgTAP — `budgets_rls_test.sql`**, fichier qui manque aujourd'hui : la table
est en place avec ses policies mais aucun test ne les exerce. Un membre lit et
écrit ; un non-membre ne lit rien et se voit refuser l'insertion ; le triplet
`(group_id, category_id, period)` est tenu ; `amount > 0` rejette zéro.

**Non couvert par un test automatisé** : l'écran, le formulaire et le bandeau —
aucun composant ni hook n'a de test JS dans ce projet, et il n'existe pas de
double de Supabase. Vérification manuelle.

## Hors périmètre

- **Budget hebdomadaire** — l'enum le permet, l'interface ne l'expose pas.
- **Historique des plafonds** — un budget modifié vaut pour toutes les
  périodes, y compris révolues. Le suivre dans le temps demanderait une table
  de versions ; c'est un autre chantier. Conséquence assumée : relever un
  plafond en cours de mois change aussi la lecture des périodes passées.
- **Report du reste** d'une période sur la suivante.
- **Budget global** tous postes confondus — le solde du dashboard le donne déjà.
- **Notification push** au franchissement — hors V1 par décision tranchée.
