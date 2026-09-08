# Écran 2 — résumé de la période budgétaire

Solde, entrées et sorties de la période en cours, au-dessus des dernières
opérations du tableau de bord.

## Périmètre

Retenu : les trois totaux, pour le groupe actif, sur la période en cours.

Écarté de cette passe, bien que présent dans la spec 2.6 : la répartition des
dépenses par catégorie, la comparaison entre périodes, le sélecteur de période,
et la vue combinée multi-groupes. Cette dernière entrerait en contradiction avec
la liste affichée juste en dessous, qui ne montre que le groupe actif — des
chiffres agrégeant d'autres groupes ne correspondraient pas aux lignes lues.

Le solde est celui de la période, pas un cumul depuis toujours. Un cumul
supposerait un solde d'ouverture par groupe, que l'app ne connaît pas : trois
dépenses saisies afficheraient un patrimoine de -180 €.

## Période budgétaire

`budget_groups.period_start_day` (smallint, défaut 1, `check between 1 and 28`).

Sur le groupe et non sur l'utilisateur : dans un budget partagé, deux membres
qui parlent du même « ce mois-ci » doivent voir les mêmes chiffres. La policy
`budget_groups_update_owner` s'applique déjà, donc seul le propriétaire décale
la période — le bon droit sans écrire de policy.

Plafond à 28 parce que le 29, le 30 et le 31 n'existent pas tous les mois : une
période démarrant le 31 sauterait silencieusement en février. Contrainte en
base, pas en formulaire, pour valoir quel que soit le client.

Bornes calculées côté client (`periodBounds` dans `src/lib/dates.ts`), jamais
par `now()` : Supabase tourne en UTC. Le 1er octobre à 00 h 30 à Paris il est
encore le 30 septembre côté serveur, et `date_trunc` répondrait « septembre »
pendant que l'appareil affiche octobre.

Intervalle semi-ouvert `[from, to)`, ce qui supprime la classe de bugs
« 30 ou 31 jours ».

## Agrégation

RPC `public.period_summary(uuid, date, date)` renvoyant `income`, `expense`,
`balance`.

`security invoker`, contrairement aux helpers de `20260904000200`. Ceux-là sont
`definer` parce qu'une policy sur `account_memberships` qui interroge
`account_memberships` récurse. Ici il n'y a pas de récursion : la policy
`transactions_select_member` s'applique telle quelle et il n'y a aucun
contournement à auditer. Un non-membre obtient 0/0/0 — pas une erreur, et
aucune information sur l'existence du groupe.

Somme faite par Postgres et non par le client : la base stocke du
`numeric(12,2)`, additionné exactement, là où JavaScript passerait par des
flottants binaires. Le solde est soustrait en SQL pour la même raison. Les
agrégats PostgREST ont été écartés : les activer demande
`pgrst.db_aggregates_enabled` sur le rôle `authenticator`, réglage global qui
ouvrirait `sum()` sur toutes les tables pour tous les clients.

## Cache

`queryKeys.periodSummary(groupId, from)` vaut `['transactions', 'summary',
groupId, from]`, imbriquée sous le préfixe des transactions à dessein : les
mutations et le Realtime invalident déjà `['transactions']`, donc le solde se
rafraîchit seul, sans que `use-transaction-mutations` ni
`use-transactions-realtime` connaissent son existence.

`from` fait partie de la clé : changer le jour de démarrage, ou passer à la
période suivante, produit une entrée neuve sans invalidation à écrire.

## Interface

Carte en tête du tableau de bord : libellé de période, solde en gros, puis
entrées et sorties.

Le libellé suit la période. Démarrage au 1er : « Solde de septembre ». Sinon
« Solde du 3 sept. au 2 oct. » — la borne haute étant exclue, la date affichée
est la veille.

Couleurs : entrées en `positive`, sorties et solde en `text`. Même convention
que la liste des opérations, où seul un revenu se colore. Un solde négatif en
cours de période est ordinaire, pas une alerte : le colorer en `danger` chaque
mois avant la paie produirait une accoutumance à l'alarme.

Erreur locale à la carte, jamais remontée à l'écran : un résumé en échec ne doit
pas masquer une liste qui a abouti.

Échelle de police : la rangée entrées/sorties s'empile au-delà de
`stackAtFontScale`, constante désormais partagée avec la liste des opérations.
Le solde est le second endroit plafonné de l'app (1,4×), pour la même raison que
le champ montant — sa largeur disponible est celle de l'écran.

## Reste à faire

- Aucun écran ne permet encore de modifier `period_start_day` : tout le monde
  reste au 1er. L'édition appartient à l'écran 7 (gestion du groupe).
- `budgets.period` porte l'énumération `weekly`/`monthly`. À l'écran 5, un
  budget mensuel devra utiliser ce même jour de démarrage, sinon la fenêtre du
  budget et celle du tableau de bord se contrediront.
