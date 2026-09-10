# Journal d'activité — traçabilité niveau 3

Date : 2026-09-10
Spec de référence : [spec-app-budget.md](../../../spec-app-budget.md) §2.1 (budgets partagés), §2.2 (modification et suppression d'une transaction), §4.1 (sécurité)

## Objectif

Dans un budget partagé, n'importe quel membre peut modifier ou supprimer n'importe quelle ligne du groupe, et rien n'en garde la trace. Ce chantier ajoute un journal qui répond à trois questions : **qui** a changé quoi, **quelle était** la valeur avant, et **qui a supprimé** une ligne qui n'existe plus.

## Constat de départ

Vérifié dans le schéma avant conception :

- `transactions_update_member` et `transactions_delete_member` autorisent tout membre du groupe, pas seulement l'auteur. C'est voulu (« dans un budget partagé, tout membre peut corriger une ligne du groupe »), et ce chantier ne le change pas.
- `user_id` désigne l'auteur de la **saisie**, pas de la dernière modification.
- `touch_updated_at()` écrit `now()` à chaque `UPDATE`, sans comparer l'avant et l'après : un enregistrement sans changement marque la ligne comme modifiée.
- La policy de modification ne fige ni `user_id` ni `group_id` : un appel direct à l'API peut réattribuer une dépense ou la déplacer de groupe.
- Une suppression efface la ligne sans laisser de trace.
- `transactions.user_id` et `budget_groups.owner_id` sont en `on delete cascade` vers `users` : supprimer le compte d'un membre efface **toutes les opérations qu'il a saisies**, y compris dans un budget partagé, et **tout groupe partagé dont il est propriétaire**. L'app n'offre pas la suppression de compte aujourd'hui (seul le dashboard Supabase le permet), et ce chantier ne change pas ces cascades — voir « Hors périmètre ».

## Décisions cadrées

| Question | Décision | Raison |
|---|---|---|
| Événements journalisés | Modifications et suppressions | Une création est entièrement décrite par la ligne elle-même (auteur, date). Une suppression garde l'ancienne valeur, donc l'auteur d'origine. Journaliser les créations noierait les rares événements qui posent une question de confiance. |
| Tables suivies | `transactions` et `budgets` | Les objectifs d'épargne (écran 6) n'existent pas encore ; y brancher le trigger plus tard tient en une ligne. |
| Lecture | Fil d'activité + mention « modifié » | Le fil est indispensable : une ligne supprimée n'existe plus, sa suppression ne peut apparaître nulle part ailleurs. La mention montre la trace là où l'on regarde déjà. |
| Calendrier | Maintenant, chantier distinct de l'écran 7 | Le journal doit exister avant le premier groupe partagé ; le séparer garde l'écran 7 raisonnable. Le cas à deux membres se prouve par pgTAP sans attendre l'écran 7. |
| Alimentation du journal | Triggers en base | Aucun chemin d'écriture n'y échappe — app, API directe, SQL. Un journal écrit par l'app serait contournable, et donner aux clients le droit d'y insérer leur permettrait d'y mentir. |
| Conservation | Permanente | Quelques lignes par mois pour un budget de foyer ; rien ne justifie une purge. |

Écartée : une table d'historique par table suivie (`transactions_history`, `budgets_history`). Plus typée, mais deux schémas à maintenir au rythme des tables d'origine, et un fil qui devrait les fusionner à la lecture.

Écartée : la suppression logique (`deleted_at`) pour tracer les suppressions. Chaque lecture de l'app devrait filtrer ces lignes — solde, répartition, budgets, historique, liste récente — et il suffit d'en oublier une pour que les totaux soient faux. Un journal à côté laisse la table principale exacte.

## Modèle de données

Une migration unique : `supabase/migrations/20260910000100_activity_log.sql`.

### Table `activity_log`

```sql
create type public.activity_subject as enum ('transaction', 'budget');
create type public.activity_action as enum ('update', 'delete');

create table public.activity_log (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.budget_groups (id) on delete cascade,
  subject        public.activity_subject not null,
  subject_id     uuid not null,
  action         public.activity_action not null,
  actor_id       uuid references public.users (id) on delete set null,
  actor_name     text,
  old_values     jsonb not null,
  new_values     jsonb,
  changed_fields text[] not null,
  occurred_at    timestamptz not null default now()
);

create index activity_log_group_occurred_idx
  on public.activity_log (group_id, occurred_at desc, id desc);
```

- `subject_id` n'a **pas de clé étrangère** : la ligne visée peut avoir été supprimée, et c'est précisément le cas qu'on veut garder.
- `actor_id` passe à `null` si l'auteur supprime son compte ; `actor_name` garde son nom **tel qu'il était au moment de l'action**. Les entrées du journal survivent donc à leur auteur. Ses opérations, elles, partent avec son compte (voir « Constat de départ ») : dans un groupe qui existe encore, ces suppressions en cascade sont journalisées comme les autres, avec leur ancienne valeur.
- `actor_id` et `actor_name` sont tous deux `null` pour une action faite hors session (console SQL, clé de service) : le journal ne prétend pas connaître un auteur qu'il n'a pas.
- `new_values` est `null` pour une suppression ; `changed_fields` y est vide.
- `on delete cascade` sur `group_id` : un groupe supprimé emporte son journal avec toutes ses autres données.
- La table **n'est pas** ajoutée à la publication Realtime (voir « Fraîcheur »).

### Droits

```sql
alter table public.activity_log enable row level security;

create policy "activity_log_select_member"
  on public.activity_log for select to authenticated
  using (public.is_group_member(group_id));

revoke insert, update, delete on public.activity_log from anon, authenticated;
```

Lecture : tout membre du groupe, et lui seul — un membre qui quitte le groupe perd l'accès. Écriture : **aucune policy**, et les droits sont retirés en plus de RLS. Aucun client ne peut ajouter, modifier ou effacer une entrée ; seuls les triggers écrivent.

### Trigger de journal

`public.log_activity()`, déclenché `AFTER UPDATE OR DELETE` sur `transactions` et `budgets`, avec le sujet passé en argument (`execute function public.log_activity('transaction')`).

Il est **`SECURITY DEFINER`**, avec `set search_path = public`. C'est justifié ici, et pas par imitation des fonctions d'appartenance : le trigger doit insérer dans une table où les clients n'ont délibérément aucun droit d'écriture. Donner ce droit aux clients pour que le trigger fonctionne en `SECURITY INVOKER` leur permettrait d'écrire eux-mêmes de fausses entrées. Une fonction de trigger n'est pas appelable comme RPC.

Comportement, dans l'ordre :

1. **Si le groupe n'existe plus, ne rien écrire.** Supprimer un groupe supprime ses opérations et ses budgets en cascade ; le trigger voudrait alors insérer une entrée pointant vers un groupe déjà effacé, la clé étrangère lèverait une erreur, et **toute la suppression du groupe serait annulée**. Même chose quand un utilisateur supprime son compte, donc son groupe personnel. Pendant une telle cascade, la ligne parente n'est plus visible : un `not exists` sur `budget_groups` suffit à la détecter. Un journal n'a de sens que pour un groupe qui existe encore.
2. **Pour une modification, comparer l'avant et l'après en ignorant `updated_at`** (`to_jsonb(row) - 'updated_at'`). Identiques : ne rien écrire. Sinon, `changed_fields` reçoit les clés dont la valeur diffère.
3. **Relever l'auteur** : `actor_id` et `actor_name` viennent **tous deux** de la ligne `users` dont l'`id` vaut `auth.uid()`, et non de `auth.uid()` directement. Si cette ligne n'existe pas, les deux restent `null`. Sans cette précaution, une cascade déclenchée par la suppression du compte de l'auteur lui-même insérerait un `actor_id` qui pointe vers une ligne `users` déjà effacée : la clé étrangère lèverait une erreur et annulerait la suppression du compte — le même piège qu'au point 1.
4. Insérer l'entrée et retourner `null`.

Effet en cascade à connaître : supprimer une catégorie personnalisée vide la catégorie de ses opérations (`on delete set null`) et supprime ses budgets (`on delete cascade`). Le groupe existant toujours, chacun de ces changements est journalisé, au nom de la personne qui a supprimé la catégorie. C'est exact, et c'est voulu : ces lignes ont bien changé. L'interface ne permet pas encore de supprimer une catégorie, donc rien ne se déclenche aujourd'hui.

### Trigger `updated_at` corrigé

`public.touch_updated_at()` est remplacé. Il compare l'avant et l'après en ignorant `updated_at`, avec la même expression que le journal, pour que les deux soient toujours d'accord :

- **changement réel** : `new.updated_at := now()` ;
- **aucun changement** : `new.updated_at := old.updated_at`.

Dans les deux cas, la valeur envoyée par le client est ignorée : `updated_at` n'est jamais sous son contrôle. Sans cette règle, une seconde mise à jour vide réglant `updated_at` sur `created_at` effacerait la mention « modifié » après coup.

La fonction est partagée par `transactions`, `budgets` et `savings_goals` ; les trois en bénéficient.

### Colonnes figées

Un trigger `BEFORE UPDATE` par table lève une erreur `42501` si l'on tente de changer :

- sur `transactions` : `user_id` (l'auteur de la saisie) et `group_id` ;
- sur `budgets` : `group_id` et `category_id`.

L'app ne modifie jamais ces champs ; la base l'autorisait. Les figer garantit que « créé par » est digne de foi et que chaque entrée du journal reste dans un seul groupe. Pour les budgets, cela aligne la base sur ce que l'interface impose déjà (la catégorie est verrouillée en édition). `42501` est déjà mappé par `data-errors.ts`.

### Remise à zéro de `updated_at` — écriture sur les données de production

La migration exécute `update … set updated_at = created_at` sur `transactions` et `budgets`, triggers `updated_at` désactivés le temps de l'opération, et **avant** la création des triggers de journal.

Désactiver les triggers n'est pas une précaution de confort : l'ancien `touch_updated_at` réécrirait `now()` sur chaque ligne, et le nouveau, qui ignore la valeur envoyée, rétablirait `old.updated_at`. Dans les deux cas la remise à zéro n'aurait aucun effet.

Raison : les dates de modification actuelles ne valent rien, puisqu'un enregistrement sans changement les faisait bouger. Sans remise à zéro, des lignes jamais réellement modifiées afficheraient « modifié » à vie.

Conséquence assumée : **le journal comme la mention commencent au jour de la migration.** Cette écriture porte sur les données réelles du projet lié et n'est pas réversible.

## Côté app

### Données — `src/data/activity.ts`

`listActivityPage(groupId, cursor, limit)`, les plus récentes d'abord, paginée **par curseur sur `(occurred_at, id)`** — même règle et même technique `.or()` que `listPage()` de l'historique, pour la même raison : une entrée qui arrive pendant le défilement décalerait toutes les pages suivantes d'un `OFFSET`.

### Formatage — `src/lib/activity-format.ts`

Module pur, sans dépendance au framework, couvert par Jest. Il reçoit une entrée, l'identifiant de l'utilisateur courant et la liste des catégories du groupe, et rend une phrase.

**Nom d'une opération** : le même que dans la liste, c'est-à-dire sa catégorie — **celle d'avant le changement**, puisque c'est sous ce nom que les membres la connaissaient —, ou « Sans catégorie ». Quand elle en a une, la note suit après un point médian, comme sur la ligne d'information de `TransactionRow`. Quand la catégorie elle-même change, le détail n'en donne que la nouvelle valeur : l'ancienne est déjà dans le nom.

| Cas | Phrase |
|---|---|
| montant d'une opération | « Marie a modifié Restaurant : 15,00 € → 150,00 € » |
| plusieurs champs | « Marie a modifié Restaurant · Pizzeria : catégorie → Alimentation, date 8 sept. → 9 sept. » |
| suppression d'une opération | « Marie a supprimé Alimentation · Carrefour, 54,00 € du 8 sept. » |
| plafond d'un budget | « Marie a modifié le plafond Restaurant : 200,00 € → 300,00 € » |
| suppression d'un budget | « Marie a supprimé le budget Restaurant (200,00 €) » |
| auteur = utilisateur courant | « Vous avez modifié… » |
| catégorie supprimée depuis | « catégorie supprimée » à la place du nom |
| auteur inconnu (hors session) | « Hors de l'app » à la place du nom |
| aucun champ affichable modifié | « Marie a modifié Restaurant », sans détail |

Les champs pris en compte pour une opération : `amount`, `category_id`, `occurred_on`, `type`, `note`. Pour un budget : `amount`. Tout autre champ présent dans `changed_fields` est ignoré à l'affichage. Une entrée dont aucun champ n'est affichable reste dans le fil avec la phrase sans détail : un journal de confiance ne cache pas d'entrée.

`old_values` et `new_values` arrivent typés `Json` par les types générés : le module les restreint par des gardes de type, sans `any`.

### Hook — `src/hooks/use-activity.ts`

Requête infinie sur `queryKeys.activity(groupId)` = `['activity', groupId]`, déclarée dans `src/lib/query-keys.ts`.

**Fraîcheur** : rechargée à chaque ouverture de l'écran, et par un geste « tirer pour rafraîchir ». **Pas de temps réel** : le fil se consulte délibérément, et une liste qui bouge sous le doigt pendant qu'on la lit est pire qu'une liste rechargée à l'ouverture. Pour la même raison, la clé n'est pas nichée sous `['transactions']` : aucune invalidation n'a besoin de l'atteindre.

### Écran — `src/app/(app)/activity.tsx`

Liste paginée sur le modèle de `history.tsx` : `FlatList` hors de `Screen`, pour garder la virtualisation. Titre « Activité », bouton retour. Chaque entrée porte sa phrase et son heure. Chargement, erreur et fin de pagination suivent les états de l'historique.

État vide : « Aucune modification ni suppression pour l'instant. »

**Point d'entrée** : un lien « Activité » à droite du titre de l'historique. C'est là qu'on vient vérifier ses opérations ; le tableau de bord porte déjà assez d'éléments.

### Mention « modifié »

Affichée quand `updated_at > created_at` — fiable grâce au trigger corrigé et à la remise à zéro :

- dans `TransactionRow`, ajoutée à la ligne d'information (« 8 sept. · modifié ») ;
- dans `BudgetRow`, ajoutée à la ligne d'état.

C'est un mot, jamais une icône seule. Toucher la ligne ouvre toujours sa fiche.

## Tests

### pgTAP — `supabase/tests/activity_log_test.sql`

Fixtures : deux membres d'un groupe partagé (Alice, Bob) et un étranger (Carole) membre d'un autre groupe.

1. Bob modifie le montant d'une opération saisie par Alice : une entrée `update` apparaît, `actor_id` = Bob, `old_values.amount` et `new_values.amount` exacts, `changed_fields` = `{amount}`.
2. Une mise à jour sans changement réel n'écrit aucune entrée.
3. La même mise à jour sans changement laisse `updated_at` intact.
4. Une mise à jour qui tente de régler `updated_at` à la main est ignorée.
5. Une suppression écrit une entrée `delete` dont `old_values` contient la ligne, et `new_values` est `null`.
6. La modification d'un plafond de budget est journalisée.
7. Carole ne lit aucune entrée du groupe.
8. Alice ne peut pas insérer d'entrée dans le journal.
9. Alice ne peut ni modifier ni effacer une entrée existante — preuve par relecture en rôle `postgres`, pas par l'absence d'erreur.
10. Changer le `user_id` d'une opération lève `42501`.
11. Changer le `group_id` d'une opération lève `42501`.
12. Changer la `category_id` d'un budget lève `42501`.
13. **Supprimer un groupe qui contient des opérations et des budgets réussit.**
14. Après suppression du compte de Bob, ses entrées subsistent avec `actor_id` à `null` et `actor_name` intact. Alice est propriétaire du groupe partagé dans les fixtures : si c'était Bob, la cascade sur `owner_id` supprimerait le groupe entier et le test ne prouverait rien.
15. La même suppression journalise, en entrées `delete`, les opérations que Bob avait saisies dans le groupe partagé.

Toute modification de `users`, `budget_groups` ou `account_memberships` passant par ces cascades, la suite complète `npm run test:db` doit rester au vert, `handle_new_user_test.sql` compris.

### Jest — `src/lib/activity-format.test.ts`

Chaque ligne du tableau de formatage ci-dessus, plus des `old_values` malformées qui ne doivent pas faire planter le module.

### Non couvert automatiquement

L'écran, le hook et la mention « modifié » — le projet n'a aucun test de composant ni de double de Supabase. Vérification manuelle ; à noter qu'une erreur de rendu propre au mode développement ne se voit que sur appareil (voir la règle `<Link asChild>` dans `CLAUDE.md`).

## Déploiement

La migration doit être poussée sur le projet lié **avant** de régénérer les types (`npx supabase gen types typescript --linked`), sans quoi le fichier généré perd `__InternalSupabase`. Elle écrit sur les données de production (remise à zéro de `updated_at`) : le push demande l'accord explicite de l'utilisateur.

## Préalable

Ce chantier modifie `BudgetRow`, livré par l'écran 5. Satisfait : la branche `ecran-5-budgets` est fusionnée dans `main`.

## Hors périmètre

- **Cascades à la suppression d'un compte** (`transactions.user_id`, `budget_groups.owner_id`). Qu'un membre qui part emporte ses dépenses du budget commun, ou le groupe entier s'il en est propriétaire, est une question de modèle qui relève de l'écran 7 (partage), avec la transmission de la propriété. Le journal en garde déjà la trace entre-temps.

- Journalisation des créations — décidé.
- Objectifs d'épargne — l'écran 6 n'existe pas.
- Annulation ou restauration d'une action depuis le journal.
- Filtres sur le fil.
- Notifications de modification.
- Export du journal.
