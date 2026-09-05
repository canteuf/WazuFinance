# Saisie de transaction — design

Écran 4 de [spec-app-budget.md](../../../spec-app-budget.md), plus le point d'entrée sur l'écran principal et la couche d'accès aux données que les écrans suivants réutiliseront.

Date : 2026-09-04

## Objectif

Permettre la création, la modification et la suppression d'une transaction, en tenant la contrainte de la spec 4.3 : saisie d'une dépense en trois taps au maximum depuis l'écran principal.

Cette contrainte n'est pas cosmétique. La spec en fait le facteur de rétention : si la saisie est lente, l'utilisateur abandonne l'app après la première semaine. Elle prime donc sur la richesse du formulaire à chaque arbitrage.

## Périmètre

**Inclus**

- Feuille de saisie : création, modification, suppression
- Point d'entrée sur le dashboard : bouton `+` et cinq dernières opérations, cliquables pour éditer
- Notion de groupe actif, partagée par toute l'app
- Couche `src/data/` et hooks de cache, réutilisables par les écrans 3, 5, 6 et 7
- Synchronisation Realtime des transactions du groupe actif
- Tests pgTAP des policies RLS sur `transactions` ; tests JS des modules purs

**Exclus, et pourquoi**

- **Solde et résumé du mois** — appartiennent à l'écran 2. Le dashboard de cette passe porte uniquement le groupe actif, les dernières opérations et le bouton `+`.
- **Liste paginée et filtres** — écran 3. L'index `transactions_group_occurred_idx` les attend, mais cette passe ne charge que cinq lignes.
- **Saisie hors-ligne** — la spec 4.2 la marque « à discuter selon la complexité acceptable ». Une file d'attente persistante avec résolution de conflits est un chantier distinct. Cette passe échoue proprement et affiche l'erreur.
- **Rattachement à un objectif d'épargne** — la colonne `transactions.savings_goal_id` existe, elle sera exploitée à l'écran 6.
- **Gestion des membres et invitations** — écran 7. Le groupe actif se contente ici de lister les adhésions existantes.

## Décisions

### Le formulaire vit dans une feuille modale

Un bouton `+` sur le dashboard ouvre la route `(app)/transaction` présentée en `formSheet`. Les trois taps de la spec se comptent dans la feuille ; l'ouverture n'en fait pas partie.

Alternative écartée : la saisie posée directement sur le dashboard. Compte de taps légèrement meilleur, mais le formulaire et la vue patrimoine de l'écran 2 se disputeraient l'espace.

Contrainte Android : ni header natif ni navigateur imbriqué dans une `formSheet`. Le titre et le bouton de fermeture sont du contenu ordinaire.

### Pas de pavé numérique maison

La feuille s'ouvre avec le champ montant focalisé et `keyboardType="decimal-pad"`. Le clavier système apparaît sans tap dédié.

Le parcours réel devient : taper les chiffres, tap catégorie, tap valider. Et comme la catégorie est pré-remplie avec la dernière utilisée, la saisie courante se termine en **un seul tap** après le montant.

Un pavé maison aurait coûté un composant à maintenir pour un gain nul sur le nombre de taps.

### Une seule route pour créer et éditer

`(app)/transaction` sans paramètre crée ; `(app)/transaction?id=<uuid>` édite. Un seul formulaire à écrire, à corriger et à tester.

### Le groupe actif est un contexte global

`ActiveGroupProvider` charge les adhésions de l'utilisateur et tient le groupe courant, initialisé sur le groupe personnel. Le dashboard l'affiche en en-tête, avec un sélecteur masqué tant qu'il n'existe qu'un groupe.

La feuille hérite du groupe actif : aucun tap supplémentaire, et rien à reprendre quand l'écran 7 introduira les budgets partagés.

Ce provider n'introduit aucun chemin de code « perso » distinct. Le compte personnel est un `budget_group` comme un autre — voir [CLAUDE.md](../../../CLAUDE.md).

### Trois couches, dépendances à sens unique

```
écrans  →  hooks  →  src/data/  →  supabase
```

- `src/data/` ne connaît que Supabase et les types générés. Aucun import React.
- `src/hooks/` ne connaît que `src/data/` et TanStack Query.
- Les écrans ne connaissent que les hooks. Aucun écran n'importe `supabase`.

Chaque couche se lit et se teste sans monter la suivante.

### TanStack Query plutôt que des hooks maison

Retenu pour trois raisons concrètes :

1. **Mutation optimiste** — TanStack Query rend possible l'insertion dans le cache dès « Valider », feuille fermée sans attendre le réseau, avec retour arrière sur échec. **Disponible mais délibérément inutilisée pour l'instant** (relecture finale du 2026-09-05, voir la décision sous « Flux de création ») : le retour arrière est le genre de code qu'on rate, et personne n'a pu l'exercer sur un appareil. La possibilité reste ouverte le jour où la latence perçue sur réseau lent justifie de la reprendre.
2. **Realtime** — un abonnement appelle `invalidateQueries` ; tous les écrans montés se rafraîchissent. Pas de propagation manuelle d'état.
3. **Partage entre écrans** — les catégories sont chargées une fois et servies aux écrans 3, 4 et 5.

Écarté : des hooks maison par ressource, qui obligeraient à réécrire cache, déduplication et retour arrière sur chaque écran suivant. Écarté aussi : un provider de données unique, qui deviendrait le point de passage obligé de toute la donnée de l'app.

## Modules

### Accès aux données

`src/data/transactions.ts`

| Fonction | Rôle |
| --- | --- |
| `listRecent(groupId, limit)` | Dernières transactions, triées par `occurred_on` décroissant |
| `getById(id)` | Chargement pour le mode édition |
| `create(input)` | Insertion |
| `update(id, patch)` | Modification |
| `remove(id)` | Suppression |

`src/data/categories.ts` — `listForGroup(groupId)` renvoie les catégories globales (`group_id IS NULL`) et celles du groupe, triées par nom.

`src/data/groups.ts` — `listMemberships()` renvoie les groupes de l'utilisateur avec son rôle, le groupe personnel en premier.

### État et cache

- `src/providers/query-provider.tsx` — `QueryClientProvider`, monté dans le layout racine
- `src/providers/active-group-provider.tsx` — groupe actif, monté dans `(app)/_layout.tsx`
- `src/lib/query-keys.ts` — clés de cache centralisées, pour éviter les invalidations qui ratent leur cible
- `src/hooks/use-active-group.ts`, `use-categories.ts`, `use-recent-transactions.ts`, `use-transaction-mutations.ts`, `use-transactions-realtime.ts`

### Utilitaires

- `src/lib/money.ts` — analyse et formatage fr-FR. Accepte `24,90` et `24.90`, refuse les valeurs négatives ou à plus de deux décimales.
- `src/lib/last-used.ts` — dernière catégorie par groupe, dans AsyncStorage, clé `last-category:<groupId>`
- `src/lib/data-errors.ts` — messages français par code Postgres

### Interface

- `src/components/transaction/amount-input.tsx`
- `src/components/transaction/category-picker.tsx` — grille filtrée par type
- `src/components/transaction/transaction-form.tsx` — formulaire partagé création/édition
- `src/components/dashboard/recent-transactions.tsx`

### Routes

- `(app)/_layout.tsx` — déclare la feuille, monte `ActiveGroupProvider` et l'abonnement Realtime
- `(app)/index.tsx` — dashboard : groupe actif, cinq dernières opérations, bouton `+`
- `(app)/transaction.tsx` — la feuille

## Comportement du formulaire

### Valeurs par défaut

| Champ | Défaut |
| --- | --- |
| Type | Dépense |
| Catégorie | Dernière utilisée pour ce groupe |
| Date | Aujourd'hui, repliée sous `Aujourd'hui ›` |
| Note | Vide, champ secondaire |

Le sélecteur de catégories filtre sur le type courant : basculer sur Revenu montre Salaire et Remboursement, pas Loyer.

### Validation

- **Montant** — strictement positif, deux décimales au plus. Le signe vient du type, jamais d'un `-` saisi.
- **Catégorie** — obligatoire. Le schéma l'autorise à `NULL` uniquement pour que `on delete set null` puisse agir si une catégorie est supprimée plus tard ; aucune ligne n'est créée sans catégorie, sinon les budgets de l'écran 5 comportent des trous.
- **`user_id`** — imposé par la policy `transactions_insert_member`, jamais choisi par le client.

### Flux de création

Séquence réellement implémentée par `src/hooks/use-transaction-mutations.ts` et
`src/app/(app)/transaction.tsx` :

1. L'utilisateur ouvre la feuille, saisit un montant, valide ; le bouton de validation passe en chargement
2. L'insertion part vers Supabase
3. En cas de succès : la catégorie retenue est enregistrée comme dernière utilisée pour ce groupe, le cache est invalidé (préfixe `transactions`, qui touche aussi bien la liste récente que les détails), et la feuille se ferme
4. En cas d'échec : la feuille reste ouverte, les valeurs saisies restent intactes, et l'erreur s'affiche au-dessus du bouton de validation

Rien n'est perdu en silence — mais la fermeture attend la réponse réseau, contrairement à ce que décrivait une version antérieure de cette spec.

**Décision (relecture finale, 2026-09-05)** : la fermeture immédiate décrite plus haut dans les versions précédentes de cette section — insertion optimiste dans le cache, fermeture avant la réponse réseau, retour arrière sur échec — n'a jamais été implémentée, et ne le sera pas pour cette passe. Le comportement livré est sûr (rien n'est perdu, l'erreur s'affiche dans la feuille avec la saisie intacte) et vérifiable ; un retour arrière de cache que personne n'a pu exercer sur un appareil aurait été un risque non vérifié pour un gain perceptible seulement sur réseau lent. La décision n'efface pas l'exigence : elle est consignée ici plutôt que silencieusement abandonnée, et reste ouverte à reprise si le besoin se confirme.

## Erreurs

`src/lib/data-errors.ts` mappe les **codes** Postgres, jamais les messages, qui changent entre versions — même règle que [src/lib/auth-errors.ts](../../../src/lib/auth-errors.ts).

| Code | Message |
| --- | --- |
| `42501` | Vous n'avez pas accès à ce budget. |
| `23503` | Cette catégorie n'existe plus. |
| `23514` | Montant invalide. |
| `23505` | Cette opération existe déjà. |
| réseau | Pas de connexion. Réessayez. |
| autre | Une erreur inattendue est survenue. |

## Tests

### pgTAP — `supabase/tests/transactions_rls_test.sql`

C'est là que se joue la sécurité, et la seule couche qui la garantisse vraiment.

- Un membre lit les transactions de son groupe
- Il ne voit pas celles d'un groupe dont il n'est pas membre
- Il ne peut pas insérer avec un `user_id` autre que le sien
- Il ne peut pas insérer dans un groupe dont il n'est pas membre
- Il peut modifier et supprimer une ligne de son groupe, y compris créée par un autre membre — comportement voulu pour un budget partagé
- Les catégories globales (`group_id IS NULL`) sont lisibles par tous, non modifiables

Les policies sont exercées en basculant `role` et `request.jwt.claims` dans la transaction de test.

### JS — `jest-expo`, périmètre étroit

Nouveau runner, limité aux modules purs :

- `src/lib/money.ts` — analyse fr-FR, arrondis, refus des valeurs invalides (règles du montant comprises : strictement positif, deux décimales au plus). Logique pure qui se casse en silence.
- `src/lib/dates.ts` — formatage relatif (« Aujourd'hui », « Hier »), conversion ISO sans décalage de fuseau
- `src/lib/data-errors.ts` — correspondance code vers message

Pas de test de rendu ni de mock de Supabase dans cette passe : le coût de maintenance dépasse le bénéfice tant que les écrans bougent. Les tests de composants viendront quand l'interface se stabilisera.

**Correction (relecture finale, 2026-09-05)** : une version antérieure de cette section annonçait que `src/lib/validation.ts` serait « étendu aux règles de transaction ». Ce n'est pas ce qui a été construit, et ça n'a pas besoin de l'être : les règles de montant vivent dans `src/lib/money.ts`, à côté de `parseAmount`/`formatAmount` qu'elles contraignent, et l'obligation de catégorie est vérifiée directement dans `transaction-form.tsx`, pas dans un module de validation générique séparé du formulaire qu'il valide. Ce placement est meilleur — chaque règle reste à côté du code qu'elle protège plutôt que dans un module partagé sans rapport direct — donc la spec est corrigée pour décrire ce qui existe.

## Risques

**La dépendance TanStack Query.** Une bibliothèque de plus à suivre. Acceptée parce que trois écrans à venir partagent les mêmes données et que Realtime a besoin d'un point d'invalidation central. La mutation optimiste reste une capacité disponible mais non exploitée pour l'instant (voir « Flux de création ») : elle ne pèse donc plus dans cette justification tant qu'elle n'est pas reprise.

**Le groupe actif est construit avant d'être vraiment utile.** L'utilisateur n'a qu'un groupe tant que l'écran 7 n'existe pas. Le provider est écrit maintenant pour éviter de reprendre chaque écran plus tard ; son coût est faible et le sélecteur reste invisible.

**Les montants transitent en `number` JavaScript.** La base stocke du `numeric(12,2)`, exact. Les valeurs manipulées restent très en deçà de la précision d'un flottant double, et le formatage passe par `src/lib/money.ts`. À revoir si le multi-devises entre un jour dans le périmètre.
