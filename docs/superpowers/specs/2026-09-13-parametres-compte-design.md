# Écran 8 — Paramètres du compte

## 1. Portée et décisions cadrées

Écran 8 couvre : modifier son nom affiché, voir son email, régler le jour de début de période du groupe actif, changer son mot de passe, se déconnecter, supprimer son compte. Il ferme aussi la faille laissée ouverte par l'écran 7 : un propriétaire de groupe partagé peut aujourd'hui échapper à `guard_owner_orphan()` en supprimant son compte, puisque la cascade s'exécute à `pg_trigger_depth() > 1` (voir `2026-09-11-gestion-groupe-design.md`, section 2.3).

Constat de départ : aucune de ces actions n'existe dans l'app. « Se déconnecter » est un bouton en bas du tableau de bord ; `users.display_name` n'est modifiable nulle part ; `budget_groups.period_start_day` (1 à 28, voir CLAUDE.md) n'a aucune interface et vaut 1 pour tous les groupes ; la suppression de compte n'est possible que depuis le dashboard Supabase.

Décisions :

- **Suppression de compte — bloquée pour le propriétaire d'un groupe partagé qui a d'autres membres.** Même règle que « Quitter le groupe » à l'écran 7, et même remède : exclure d'abord les autres membres. La vérification a lieu dans la RPC qui supprime le compte, avant la suppression, pas dans un trigger : c'est ce que la spec de l'écran 7 prévoyait, parce qu'un trigger au milieu d'une cascade ne peut pas trancher de façon déterministe. Pas de transfert de propriété, décision de l'écran 7 inchangée.
- **Les opérations d'un membre qui supprime son compte partent avec lui, y compris dans les groupes partagés qui lui survivent.** C'est le comportement actuel (`transactions.user_id` en `on delete cascade`), et il est conservé. L'alternative — garder les opérations en effaçant l'auteur (`user_id` nullable, `on delete set null`) — oblige à contourner `guard_immutable_columns()` pendant la cascade, fait avancer `updated_at` sur chaque ligne (donc afficher « modifié » partout) via `touch_updated_at()`, et remplit le journal d'entrées « modification » : trois exceptions en chaîne dans des mécanismes qui ont été conçus pour ne pas en avoir. L'écran de confirmation l'annonce explicitement (section 5.5), et le journal attribue ces suppressions au membre par son nom (section 2.3).
- **Mot de passe actuel exigé pour changer de mot de passe et pour supprimer le compte.** Vérifié côté client par `signInWithPassword` avant l'action. Cette vérification protège contre l'usage d'un téléphone déverrouillé laissé sans surveillance ; elle ne protège pas contre un jeton de session volé, qui pourrait appeler l'API directement — un tel jeton permet déjà tout le reste, et ce n'est pas la menace visée.
- **Jour de début de période : réglage du groupe actif, par son propriétaire.** `period_start_day` vit sur le groupe (CLAUDE.md, « The budget period is not the calendar month »), et `budget_groups_update_owner` limite déjà qui peut le changer. L'écran agit sur le groupe actif, nommé dans l'en-tête de la section ; pour le compte personnel l'utilisateur en est toujours propriétaire. Un simple membre d'un groupe partagé voit la valeur, sans pouvoir la modifier. Un seul endroit pour ce réglage plutôt qu'un pour le compte personnel ici et un pour les groupes partagés dans `group.tsx`.
- **Email en lecture seule.** Le changer passe par un email de confirmation de Supabase Auth dont le lien doit rouvrir l'app : aucune infrastructure de deep link n'existe (même constat qu'à l'écran 7 pour les invitations). Hors périmètre.
- **Pas de « mot de passe oublié ».** Même raison : le lien de réinitialisation doit rouvrir l'app. Hors périmètre, à traiter avec l'infrastructure de deep link le jour où elle existera.
- **« Se déconnecter » quitte le tableau de bord pour cet écran.** Le bas du tableau de bord accueille à la place l'entrée « Paramètres ».

Hors périmètre, en plus des deux points ci-dessus : export CSV/PDF (chantier dédié, spec V1 section 6), catégories personnalisées, transfert de propriété, suppression d'un groupe partagé, thème, notifications.

## 2. Modèle de données

Une migration `20260913000100_account_settings.sql`, en quatre parties.

### 2.1 Privilèges par colonne sur `users` et `budget_groups`

Cet écran est le premier à écrire dans ces deux tables depuis l'app. Aujourd'hui `authenticated` a `update` sur toutes leurs colonnes : `users_update_self` laisse donc un utilisateur réécrire son propre `users.email` (qui se désynchroniserait de `auth.users`), et `budget_groups_update_owner` laisse un propriétaire changer `owner_id` ou `is_personal` de son groupe par un appel direct à l'API. Les policies décident *quelles lignes* ; les privilèges par colonne décident *quelles colonnes* :

```sql
revoke update on public.users from authenticated;
grant update (display_name) on public.users to authenticated;

revoke update on public.budget_groups from authenticated;
grant update (name, period_start_day) on public.budget_groups to authenticated;
```

`name` reste modifiable bien qu'aucune interface ne le fasse aujourd'hui : c'est une donnée d'affichage, comme `display_name`, et le retirer ne protège rien. Les actions référentielles (`on delete set null`, `on delete cascade`) s'exécutent avec les droits du propriétaire des tables et ne sont pas concernées. Aucune fonction `SECURITY DEFINER` existante n'est concernée non plus.

Pas de contrainte `check` sur la longueur de `display_name` : même décision qu'à l'écran 7 pour `budget_groups.name`, la validation reste côté client (`validateDisplayName`).

### 2.2 `owned_groups_with_other_members()`

Liste les groupes partagés dont l'appelant est propriétaire et qui comptent d'autres membres — ceux qui bloquent la suppression du compte. Une seule définition, utilisée deux fois : par l'écran pour désactiver le bouton et nommer les groupes en cause, par `delete_own_account()` pour refuser la suppression. Deux définitions finiraient par diverger.

```sql
create function public.owned_groups_with_other_members()
returns table (id uuid, name text)
language sql
stable
security invoker
set search_path = public
as $$
  select g.id, g.name
    from public.budget_groups g
    join public.account_memberships own
      on own.group_id = g.id
     and own.user_id = auth.uid()
     and own.role = 'owner'
   where not g.is_personal
     and exists (
       select 1 from public.account_memberships m
        where m.group_id = g.id and m.user_id <> auth.uid()
     )
   order by g.name;
$$;

revoke all on function public.owned_groups_with_other_members() from public, anon;
grant execute on function public.owned_groups_with_other_members() to authenticated;
```

`SECURITY INVOKER` : la fonction lit `account_memberships` hors de toute policy, donc sans récursion — même raisonnement que `period_summary()` dans CLAUDE.md. RLS s'applique telle quelle et suffit : `account_memberships_select_member` laisse l'appelant voir toutes les adhésions des groupes dont il est membre, ce qui est exactement ce que `exists` interroge.

Le propriétaire est repéré par son adhésion `role = 'owner'`, comme dans `guard_owner_orphan()`, et non par `budget_groups.owner_id`. Les deux coïncident dans tous les cas que l'app produit. Ils ne divergent que dans un cas marginal, noté en section 7.

### 2.3 `delete_own_account()`

```sql
create function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_blocking text;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  select string_agg(format('« %s »', b.name), ', ' order by b.name)
    into v_blocking
    from public.owned_groups_with_other_members() b;

  if v_blocking is not null then
    raise exception 'Groupes partagés dont vous êtes propriétaire et qui ont encore d''autres membres : %. Excluez ces membres avant de supprimer votre compte.', v_blocking;
  end if;

  -- Supprimées explicitement avant le compte, pour que le journal les
  -- attribue au membre : pendant la cascade, sa ligne users a déjà disparu et
  -- log_activity() les enregistrerait sans auteur (« Hors de l'app »).
  -- Seuls les groupes qui survivent au compte sont concernés : ceux dont il
  -- est propriétaire partent entiers, et log_activity() n'y journalise rien.
  delete from public.transactions t
   where t.user_id = v_uid
     and exists (
       select 1 from public.budget_groups g
        where g.id = t.group_id and g.owner_id <> v_uid
     );

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
```

`SECURITY DEFINER` pour une raison propre, pas par imitation : un client n'a et ne doit avoir aucun droit sur `auth.users`. Appelée depuis cette fonction, `owned_groups_with_other_members()` s'exécute avec les droits du propriétaire et échappe à RLS, mais elle filtre explicitement sur `auth.uid()`, qui reste celui de l'appelant : le résultat est le même.

Message d'erreur neutre en nombre (un ou plusieurs groupes) : il remonte en `P0001` et `data-errors.ts` l'affiche tel quel.

Ce que la suppression emporte, par les cascades existantes et sans rien de nouveau : le profil `users`, le compte personnel et tout son contenu, les groupes partagés dont l'utilisateur est propriétaire (forcément seul membre à ce stade), ses adhésions aux autres groupes, ses opérations dans ces groupes et dans ceux qu'il a quittés — quitter un groupe laisse ses opérations en place, `user_id` le désigne toujours — (supprimées juste avant, voir le commentaire), ses objectifs d'épargne, les invitations qu'il a créées. Les entrées de journal qu'il a écrites survivent, à son nom, sans `actor_id` (`activity_log.actor_id` en `on delete set null`, décision du journal d'activité). `guard_personal_group_membership()` et `guard_owner_orphan()` laissent passer la cascade, comme le prouvent déjà `handle_new_user_test.sql` et `group_management_rls_test.sql`.

Concurrence : si un invité rejoint un groupe entre la vérification et la suppression, dans la même fraction de seconde, la cascade l'en retire avec le groupe. Fenêtre négligeable pour un budget de foyer ; pas de verrou.

**Point à vérifier en implémentation.** En local, `postgres` est superutilisateur : un test pgTAP qui passe ne prouve pas qu'une fonction appartenant à `postgres` peut supprimer une ligne de `auth.users` sur le projet hébergé. Le plan inclut une vérification sur le projet lié, avec un compte jetable, avant de considérer la fonctionnalité terminée. Si le droit manque, repli : une Edge Function `delete-account` qui fait la même vérification puis appelle `auth.admin.deleteUser()` avec la clé de service — plus lourd (première Edge Function du projet, secret à gérer), donc seulement si nécessaire.

### 2.4 Rien d'autre

`period_start_day` a déjà sa contrainte `check (between 1 and 28)` et sa policy de mise à jour. `users_update_self` existe déjà. La mise à jour du mot de passe passe par Supabase Auth, pas par une table.

## 3. Couche données

**Nouveau `src/data/profile.ts`** :

```ts
export type Profile = { id: string; email: string; displayName: string };

export async function getProfile(userId: string): Promise<Profile>
export async function updateDisplayName(userId: string, displayName: string): Promise<void>
```

- `getProfile` → `select id, email, display_name` sur `users`, `.eq('id', userId).single()`. Paramètre explicite, jamais de `getUser()` interne (convention du projet).
- `updateDisplayName` → `update({ display_name: displayName.trim() })`, `.eq('id', userId).select('id').single()` pour qu'une ligne filtrée par RLS lève une erreur au lieu de réussir en silence, même précédent que `removeMember`.

**Nouveau `src/data/account.ts`** :

```ts
export type DeletionBlocker = { groupId: string; name: string };

export async function listDeletionBlockers(): Promise<DeletionBlocker[]>
export async function deleteOwnAccount(): Promise<void>
```

- `listDeletionBlockers` → `supabase.rpc('owned_groups_with_other_members')`.
- `deleteOwnAccount` → `supabase.rpc('delete_own_account')`.

**`src/data/groups.ts`** gagne :

```ts
export async function updatePeriodStartDay(groupId: string, day: number): Promise<void>
```

→ `update({ period_start_day: day })` sur `budget_groups`, `.eq('id', groupId).select('id').single()`.

**`src/lib/dates.ts`** gagne une fonction pure :

```ts
/** « le 1er », « le 5 » : jour de début de période, pour une phrase. */
export function periodStartDayLabel(day: number): string
```

Le 1er s'écrit « 1er » en français, les autres jours en chiffres seuls. Couverte par Jest.

**`src/lib/auth-errors.ts`** gagne une entrée :

```ts
same_password: 'Le nouveau mot de passe doit être différent de l’actuel.',
```

## 4. Auth et hooks

**`AuthProvider`** gagne deux actions, parce que toutes deux touchent la session :

```ts
changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
deleteAccount: (currentPassword: string) => Promise<void>;
```

- Les deux commencent par `verifyPassword(currentPassword)`, fonction interne au provider : `signInWithPassword({ email: session.user.email, password })`. Sur `invalid_credentials`, elle lève une erreur dédiée (`CurrentPasswordError`) que l'écran affiche sous le champ « Mot de passe actuel » : le message générique d'`auth-errors.ts` (« Email ou mot de passe incorrect. ») serait trompeur ici, l'email n'étant pas saisi. Effet de bord accepté : la vérification ouvre une nouvelle session pour le même utilisateur ; `onAuthStateChange` la reçoit, `useClearCacheOnUserChange()` ne vide rien puisque l'identifiant ne change pas.
- `changePassword` → vérification, puis `supabase.auth.updateUser({ password: newPassword })`. Si l'option « Secure password change » est activée sur le projet hébergé, la connexion qui vient d'avoir lieu satisfait son exigence de connexion récente.
- `deleteAccount` → vérification, puis `deleteOwnAccount()`, puis `supabase.auth.signOut({ scope: 'local' })`. Pas le `signOut()` par défaut (`scope: 'global'`) : il appellerait l'API de déconnexion avec le jeton d'un utilisateur qui n'existe plus, et lèverait une erreur après une suppression réussie. La déconnexion locale efface la session stockée ; `Stack.Protected` bascule sur les écrans d'authentification, `useClearCacheOnUserChange()` vide le cache. Sur les autres appareils de l'utilisateur, le jeton d'accès reste lisible jusqu'à son expiration (une heure au plus) mais RLS n'y renvoie plus rien, et le rafraîchissement suivant échoue et les déconnecte.

**Hooks** :

- `use-profile.ts` : `useQuery` sur `queryKeys.profile()` (activé quand `userId` est connu) + mutation `updateDisplayName`, qui invalide `queryKeys.profile()`. Rien d'autre à invalider : la liste des membres d'un groupe se recharge à chaque ouverture (`refetchOnMount: 'always'`, écran 7), et le journal garde volontairement le nom tel qu'il était au moment de l'action.
- `use-group-mutations.ts` gagne `updatePeriodStart` (`{ groupId, day }`), qui invalide `queryKeys.memberships()` : `periodStartDay` y est lu, et les clés du tableau de bord dérivent leurs bornes de cette valeur — changer le jour ouvre des entrées neuves, rien d'autre à invalider. Les autres membres d'un groupe partagé voient le nouveau jour au prochain rechargement de leurs adhésions (`budget_groups` n'est pas dans la publication Realtime) ; acceptable pour un réglage aussi rare.
- `use-deletion-blockers.ts` : `useQuery` sur `queryKeys.deletionBlockers()`, `refetchOnMount: 'always'` — un membre a pu partir ou être exclu depuis un autre appareil.
- Changement de mot de passe et suppression : pas de `useMutation`, l'écran appelle `useAuth()` avec un état local de chargement et d'erreur, comme les écrans de connexion et d'inscription.

`query-keys.ts` ajoute deux clés plates, sans groupe, comme `savingsGoals` :

```ts
profile: () => ['profile'] as const,
deletionBlockers: () => ['deletionBlockers'] as const,
```

## 5. Écrans et composants

### 5.1 `src/app/(app)/settings.tsx`

Écran plein, déclaré dans `(app)/_layout.tsx` (`<Stack.Screen name="settings" />`), même en-tête que `groups.tsx` (« ‹ » + titre « Paramètres »). Cinq sections empilées, chacune dans son composant sous `src/components/settings/` pour garder l'écran court :

1. `profile-section.tsx`
2. `period-section.tsx`
3. `password-section.tsx`
4. « Se déconnecter » — un bouton, directement dans l'écran
5. `delete-account-section.tsx`

Chaque section porte ses propres états de chargement et d'erreur : une section en échec n'emporte pas les autres, même principe que les cartes du tableau de bord.

### 5.2 Profil

Champ « Nom affiché » (`TextField`) pré-rempli depuis `getProfile`, validé par `validateDisplayName`, bouton « Enregistrer » actif seulement si la valeur a changé. Retour de succès bref (« Enregistré »), comme « Copié ! » à l'écran 7. L'email s'affiche en dessous, en texte, avec la mention « L’email ne peut pas être modifié pour l’instant. »

### 5.3 Période budgétaire

Titre : « Période budgétaire — {nom du groupe actif} ». Phrase : « Chaque période commence {periodStartDayLabel(jour)} du mois. » avec, pour le jour 1, « (mois calendaire) ».

- Propriétaire du groupe actif : un sélecteur « − {jour} + » borné à 1 et 28 (boutons désactivés aux bornes, donc aucune valeur invalide ne peut être saisie), et un bouton « Enregistrer » actif seulement si la valeur a changé. Texte d'aide sous le sélecteur : « Utile pour caler la période sur le jour de paie. Les jours 29 à 31 n’existent pas tous les mois. »
- Simple membre : la phrase seule, suivie de « Réglé par le propriétaire du groupe. »

Pas d'enregistrement à chaque appui : chaque changement de jour recalcule les bornes et recharge le tableau de bord, et dix appuis pour passer du 1er au 11 ne doivent pas déclencher dix recalculs.

### 5.4 Mot de passe

Fermée par défaut : un bouton « Changer le mot de passe » déplie trois champs (`secureTextEntry`) — « Mot de passe actuel », « Nouveau mot de passe » (`validatePassword`), « Confirmation » (identique au nouveau, même contrôle qu'à l'inscription). Boutons « Enregistrer » et « Annuler ». Succès : la section se replie et affiche « Mot de passe modifié. »

### 5.5 Supprimer le compte

- **Bloquée** (`listDeletionBlockers()` non vide) : bouton « Supprimer mon compte » désactivé, avec le texte « Ces groupes partagés dont vous êtes propriétaire ont encore d’autres membres : {liste des groupes}. Excluez ces membres depuis la gestion du groupe avant de supprimer votre compte. » — formulation neutre en nombre, comme le message de la RPC. Chaque nom de groupe ouvre son détail (`/group?id=`). Même logique que « Quitter le groupe » : une action impossible est expliquée, pas simplement morte.
- **Possible** : bouton « Supprimer mon compte ». L'appui ouvre une confirmation portée par l'état du composant — pas `Alert.alert`, qui ne fait rien sur le web (même motif que `budget-form.tsx`) — qui affiche :
  - « Cette action est définitive. Seront supprimés : votre compte personnel et toutes ses opérations, budgets et objectifs d’épargne ; les groupes partagés dont vous êtes le seul membre ; vos opérations dans les autres groupes partagés, y compris ceux que vous avez quittés, qui disparaîtront aussi pour leurs membres. »
  - un champ « Mot de passe actuel » ;
  - « Supprimer définitivement » (`variant="danger"`, actif seulement si le champ est rempli) et « Annuler ».

  Succès : aucune navigation manuelle, `Stack.Protected` ramène sur la connexion (CLAUDE.md : « Navigation never redirects manually after auth »).

### 5.6 Tableau de bord

Le bouton « Se déconnecter » en bas de `index.tsx` est remplacé par une entrée « Paramètres » vers `/settings` (bouton `variant="ghost"`, même place). `useAuth` n'y est plus utilisé et disparaît de ses imports.

## 6. Gestion des erreurs

- Nom affiché, période : `dataErrorMessage`. Aucun code nouveau à mapper — l'app n'écrit que les colonnes autorisées, une erreur `42501` de privilège de colonne n'est atteignable que par un appel direct à l'API.
- Mot de passe : `CurrentPasswordError` sous le champ « Mot de passe actuel » ; le reste (`weak_password`, `same_password`, réseau) par `authErrorMessage`.
- Suppression : `CurrentPasswordError` sous le champ ; le refus de `delete_own_account()` (groupes bloquants, cas où la liste affichée était périmée) remonte en `P0001` et s'affiche tel quel via `dataErrorMessage`, puis `listDeletionBlockers` est invalidée pour que la section passe à l'état bloqué.
- Suppression réussie côté base mais déconnexion locale en échec : impossible en pratique, `signOut({ scope: 'local' })` n'appelle pas le réseau.

## 7. Limites assumées

- **Suppression faite hors de l'app.** Un administrateur qui supprime un utilisateur depuis le dashboard Supabase ne passe pas par `delete_own_account()` : la vérification ne s'applique pas. L'échappatoire fermée est celle des clients, la seule que l'app expose.
- **Groupe à zéro membre ranimé par une invitation encore active.** Cas découvert en préparant cet écran, antérieur à lui : quand le dernier propriétaire quitte un groupe (autorisé s'il est seul, écran 7), une invitation encore valide reste utilisable, et l'invité rejoint un groupe dont `owner_id` désigne quelqu'un qui n'en est plus membre. `owned_groups_with_other_members()` ne compte pas ce groupe comme bloquant (l'ancien propriétaire n'y a plus d'adhésion `owner`), donc la suppression du compte de l'ancien propriétaire est permise et la cascade par `owner_id` emporte le groupe et l'adhésion de l'invité. Repérer le propriétaire par `owner_id` bloquerait au contraire la suppression à cause d'un groupe que l'utilisateur ne voit même plus, sans aucun moyen de débloquer — pire. La vraie correction est de révoquer les invitations actives quand le dernier membre quitte un groupe ; elle relève de l'écran 7 et ne fait pas partie de ce lot.
- **Vérification du mot de passe côté client** : voir section 1.

## 8. Tests

Nouveau fichier `supabase/tests/account_settings_test.sql` :

- Privilèges par colonne : un utilisateur modifie son `display_name` ; ne peut pas modifier son `email` (`42501`) ; ne modifie aucune ligne en visant le `display_name` d'un autre. Un propriétaire modifie `period_start_day` de son groupe ; un simple membre ne modifie aucune ligne ; un propriétaire ne peut modifier ni `owner_id` ni `is_personal` (`42501`).
- `owned_groups_with_other_members()` : renvoie un groupe partagé possédé qui a un autre membre ; ignore le compte personnel, un groupe possédé où l'appelant est seul, un groupe où l'appelant n'est que membre.
- `delete_own_account()` : refusée à `anon` (`42501`) ; refusée (`P0001`, message listant le groupe) pour un propriétaire dont le groupe a d'autres membres, sans rien supprimer ; permise une fois ces membres exclus — `auth.users`, `users`, compte personnel et groupe partagé possédé disparaissent.
- Suppression par un simple membre : ses opérations dans le groupe partagé disparaissent, celles des autres membres restent, le groupe survit, et les entrées de journal de ces suppressions portent `actor_name` = son nom (l'attribution de la section 2.3). Le test existant d'`activity_log_test.sql` (suppression directe dans `auth.users`, entrées sans auteur) reste valide : il décrit la suppression hors de l'app.

Jest : `periodStartDayLabel` dans `dates.test.ts` (« le 1er », « le 2 », « le 28 »).

Vérification manuelle sur appareil, dans le plan : chaque section, dont la suppression d'un compte jetable sur le projet hébergé (voir le point à vérifier en section 2.3).

## 9. Documentation

CLAUDE.md : remplacer le paragraphe qui décrit la suppression de compte comme échappatoire acceptée à `guard_owner_orphan()` par la description de `delete_own_account()` (vérification préalable, attribution des suppressions dans le journal, droit sur `auth.users` qui justifie `SECURITY DEFINER`), et mentionner les privilèges par colonne sur `users` et `budget_groups` dans la section RLS.
