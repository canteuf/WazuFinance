# Écran 3 — historique des transactions

Liste paginée de toutes les opérations du groupe actif, filtrable par période,
par catégorie et par type. Atteinte depuis le « Tout voir » du tableau de bord.

## Périmètre

Retenu : la liste paginée, un filtre de période, un filtre de catégorie, et un
sélecteur dépenses/revenus.

Le sélecteur de type dépasse la lettre de la spec 2.2, qui nomme « période,
catégorie, groupe ». Il est retenu parce que sans lui, « montre-moi mes
revenus » obligerait à sélectionner chaque catégorie de revenu une par une.

Écartée : la recherche texte dans les notes, absente de la spec, qui
demanderait un index trigramme et une gestion du délai de frappe pour un besoin
que personne n'a encore.

Écarté aussi, le **filtre par groupe** que la spec 2.2 nomme. Il entre en
contradiction avec `ActiveGroupProvider`, qui pose un seul groupe actif pour
toute l'app : filtrer par groupe ici reviendrait à en changer, ce qui est le
rôle du sélecteur de l'écran 7. Le reprendre ici créerait deux chemins pour la
même décision.

## Pagination par curseur

Le décalage (`OFFSET`, soit `.range()`) est écarté. Entre deux pages, une
insertion décale toutes les suivantes et fait apparaître une ligne deux fois ;
une suppression en saute une. Avec le Realtime qui insère pendant le
défilement, c'est un cas courant et non une hypothèse.

La pagination porte donc sur le couple `(occurred_on, id)` :

```sql
where group_id = ?
  and (occurred_on, id) < (curseur_date, curseur_id)
order by occurred_on desc, id desc
limit 20
```

Ce n'est pas une décision neuve. `transactions_group_occurred_idx` est déjà
`(group_id, occurred_on desc, id desc)`, et le commentaire de `listRecent()`
énonce que le départage par `id` existe pour rendre cette pagination stable
quand plusieurs lignes partagent une date.

PostgREST n'exprime pas la comparaison de couples. Le prédicat équivalent passe
par un `.or()` combinant `occurred_on.lt.<date>` et
`and(occurred_on.eq.<date>,id.lt.<id>)`. Les deux valeurs du curseur
proviennent de lignes déjà renvoyées par le serveur, jamais d'une saisie.

Aucune migration : tous les filtres portent sur des colonnes existantes et le
curseur réutilise l'index en place.

## Couche de données

```ts
export type TransactionFilters = {
  from: string | null;      // null = « Tout », aucune borne
  to: string | null;
  categoryId: string | null;
  type: TransactionType | null;
};

export async function listPage(
  groupId: string,
  filters: TransactionFilters,
  cursor: { occurredOn: string; id: string } | null,
  limit: number
): Promise<TransactionWithCategory[]>;
```

`useInfiniteQuery`, avec `getNextPageParam` renvoyant le curseur de la dernière
ligne de la page, ou `undefined` quand la page est plus courte que `limit`.

## Cache

```ts
transactionHistory: (groupId: string, filters: TransactionFilters) =>
  ['transactions', 'history', groupId, filters] as const,
```

Imbriquée sous `['transactions']` comme le résumé de période : elle hérite des
invalidations déjà posées par les mutations et par le Realtime, sans que
ceux-ci aient à la connaître.

Les filtres entrent dans la clé, donc changer de filtre ouvre une entrée neuve
plutôt que d'écraser la précédente : revenir à un filtre déjà consulté
réaffiche immédiatement.

Coût accepté : invalider une requête infinie recharge toutes les pages déjà
chargées. Quelqu'un descendu à la page 10 qui reçoit un événement Realtime
déclenche dix requêtes. `maxPages` est le levier si cela devient gênant, mais
il fait perdre la position de défilement, donc il n'est pas activé.

## Filtre de période

Quatre préréglages, tous dérivés de `periodBounds()` et de
`budget_groups.period_start_day` : « En cours », « Précédente »,
« 3 dernières », « Tout » (aucune borne).

Calés sur la période budgétaire et non sur le mois calendaire : si le jour de
démarrage n'est pas le 1er, un préréglage « ce mois » afficherait une somme
différente du solde du tableau de bord, sans que rien n'explique l'écart.

`periodPresets(today, startDay)` est une fonction pure de `src/lib/dates.ts`,
donc couverte par Jest.

## État des filtres

À l'ouverture : période « En cours », type « Tout », catégorie « Toutes ». Le
« Tout voir » du tableau de bord ne transmet aucun filtre — il ouvre l'écran
dans cet état par défaut, dont la période coïncide avec le solde affiché juste
au-dessus du lien.

Cet état vit dans un `useState` de `history.tsx`, pas dans un provider : aucun
autre écran n'en dépend, et le sortir du composant obligerait à décider quand
le remettre à zéro entre deux visites. Il est donc perdu quand on quitte
l'écran, ce qui est le comportement voulu — on revient à l'historique pour
regarder la période en cours.

## Interaction entre les deux filtres

Le type restreint la liste des catégories proposées : inutile d'offrir Salaire
quand on regarde des dépenses. Si la catégorie sélectionnée disparaît de cette
liste après un changement de type, la sélection tombe.

Dérivé au rendu, pas synchronisé par un effet — même forme que
`transaction-form.tsx` pour le même problème, la règle
`react-hooks/set-state-in-effect` ayant déjà rejeté l'autre forme deux fois.

## Structure de l'écran

L'écran n'utilise pas `Screen`, qui enveloppe un `ScrollView` : imbriquer une
`FlatList` dans un `ScrollView` désactive la virtualisation, et React Native
l'avertit. Une liste paginée non virtualisée garde toutes ses lignes montées et
perd l'intérêt de la pagination.

L'écran monte donc une `FlatList` directement, avec la barre de filtres en
`ListHeaderComponent` — elle défile ainsi avec la liste au lieu d'occuper de la
hauteur en permanence.

En-tête propre à l'écran (chevron de retour, puis « Opérations ») plutôt que
l'en-tête natif, qui serait peint par le thème par défaut d'expo-router et non
par la palette du projet. Même motif que la feuille de saisie. Le retour
matériel Android reste géré par la pile.

Les pastilles de filtre sont des contrôles à rayon `pill`, pas des `Button` :
à 52 px de hauteur minimale chacun, une rangée de boutons occuperait la moitié
de l'écran.

Le bouton `+` flottant est présent ici aussi. La spec 4.3 impose la saisie en
trois taps depuis l'écran principal, or l'historique est précisément l'endroit
où l'on constate un oubli ; obliger à revenir en arrière irait contre la
contrainte.

## Ligne d'opération partagée

La ligne est extraite de `recent-transactions.tsx` vers un composant partagé.
Les deux écrans affichent la même chose, et la dupliquer ferait diverger la
logique d'empilement à forte échelle de police, écrite une seule fois.

## États vides et erreurs

Deux états vides distincts. Aux filtres par défaut : « Aucune opération pour
l'instant. » Dès qu'un filtre s'écarte du défaut et que rien ne remonte :
« Aucune opération avec ces filtres. », suivi d'un bouton « Réinitialiser les
filtres » qui les ramène tous les trois à leur valeur d'ouverture. Un message
unique ferait croire à une disparition des données là où il n'y a qu'un filtre
trop étroit.

Erreurs à deux niveaux. Première page en échec : l'écran affiche le message et
un bouton pour réessayer. Page suivante en échec : le message va en pied de
liste et les lignes déjà chargées restent — les effacer parce que la suivante
n'est pas venue serait une régression.

## Tests

pgTAP, `transaction_paging_test.sql` : cinq lignes dont deux partageant une
date, parcourues par pages de deux avec le prédicat de curseur ; la réunion des
pages doit faire exactement les cinq lignes, sans répétition ni trou. C'est le
seul endroit où un défaut de pagination se manifeste.

Jest : `periodPresets` sur les quatre préréglages, dont le passage
décembre/janvier sur « Précédente ».

Aucun test de composant, ce projet n'en a pas. La `FlatList`, le chargement de
la page suivante, la remise à zéro sur changement de filtre et les états vides
ne seront prouvés que par une vérification manuelle.

Vérification manuelle indispensable : descendre au-delà de la première page
avec plus de 25 opérations dont au moins deux à la même date. Sans ces deux-là,
la pagination paraît correcte même si le départage est cassé.

## Fichiers

Nouveaux : `src/app/(app)/history.tsx`,
`src/components/transaction/transaction-row.tsx`,
`src/components/history/filter-bar.tsx`,
`src/hooks/use-transaction-history.ts`,
`supabase/tests/transaction_paging_test.sql`.

Modifiés : `src/data/transactions.ts`, `src/lib/query-keys.ts`,
`src/lib/dates.ts` et son test,
`src/components/dashboard/recent-transactions.tsx`,
`src/app/(app)/index.tsx`, `src/app/(app)/_layout.tsx`, `CLAUDE.md`.
