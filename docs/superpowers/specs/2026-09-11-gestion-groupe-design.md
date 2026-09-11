# Écran 7 — Gestion du groupe (membres, invitations, rôles)

## 1. Portée et décisions cadrées

Écran 7 couvre : créer un groupe partagé, inviter par code, rejoindre un groupe, voir les membres et leur rôle, quitter ou exclure un membre, changer de groupe actif. La base (`budget_groups`, `account_memberships`, `group_invitations`, RLS, `join_group_with_code()`) existe déjà presque entièrement ; ce qui manque est décrit en section 2.

Décisions prises pendant le brainstorming :

- **Propriétaire orphelin — bloquer, sans transfert.** Un propriétaire ne peut pas quitter le groupe (ni en être exclu, en pratique impossible puisqu'il n'y a personne au-dessus de lui) tant que le groupe compte d'autres membres. Il doit d'abord les exclure. Pas de fonctionnalité de transfert de propriété : le besoin réel n'est pas confirmé, même principe que le lien versement→objectif d'épargne (ne pas construire par anticipation). Le blocage vient d'un trigger côté base pour cette action volontaire précise ; côté client, le bouton « Quitter » est simplement désactivé quand il s'appliquerait. La suppression de compte n'est **pas** couverte par ce blocage dans ce lot de travail : voir la limite assumée en section 2.3 — l'écran 8 (paramètres du compte, pas encore conçu) devra la traiter explicitement le jour où il existera.
- **Rôles — affichage seul en V1.** `account_memberships_update_owner` existe déjà en base mais rien ne l'exploite : pas d'UI pour changer le rôle d'un membre (donc pas de co-propriétaire) en V1. Le rôle de chacun est affiché, pas modifiable.
- **Invitation — par code uniquement, pas de lien.** Aucune infrastructure de deep link n'existe dans l'app, et `expo-clipboard` n'est pas installé. Le propriétaire génère un code à 8 caractères, le copie ou le communique de vive voix/écrit, l'invité le saisit dans « Rejoindre un groupe ». Pas de partage par lien, pas de `Share` système en V1.
- **Une invitation active à la fois par groupe.** Le propriétaire voit le code actif s'il en existe un (ni révoqué, ni expiré, ni utilisé) ; sinon un bouton « Générer un code ». « Régénérer » révoque l'actif et en crée un nouveau. Durée de validité fixe : 7 jours, non configurable en V1.
- **Exclure un membre et quitter un groupe utilisent la policy existante** (`account_memberships_delete_owner_or_self`) : aucun changement de base n'est nécessaire pour ces deux actions, seulement le nouveau trigger de garde ci-dessous, qui s'applique aux deux.

## 2. Modèle de données (nouveau)

Trois ajouts, dans une seule migration `<timestamp>_group_management.sql` :

### 2.1 `create_shared_group(name text) returns uuid`

Résout un problème d'œuf et de poule : `account_memberships_insert_owner` exige `is_group_owner(group_id)`, qui ne peut jamais être vrai pour la toute première ligne d'un groupe (aucune ligne `owner` n'existe encore). La policy `budget_groups_insert_shared` seule suffit pour créer la ligne du groupe, mais pas pour la ligne d'adhésion qui suit.

`SECURITY DEFINER`, même famille que `join_group_with_code()` :

```sql
create function public.create_shared_group(name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  insert into public.budget_groups (name, owner_id, is_personal)
  values (name, auth.uid(), false)
  returning id into new_group_id;

  insert into public.account_memberships (group_id, user_id, role)
  values (new_group_id, auth.uid(), 'owner');

  return new_group_id;
end;
$$;

revoke all on function public.create_shared_group(text) from public, anon;
grant execute on function public.create_shared_group(text) to authenticated;
```

Pas de validation de longueur/contenu du nom ici : `budget_groups.name` n'a aujourd'hui aucune contrainte `check`, et lui en ajouter une dépasserait le périmètre de cet écran.

### 2.2 Code d'invitation généré en base

`group_invitations.code` n'a pas de défaut aujourd'hui — l'INSERT direct du propriétaire (déjà permis par `group_invitations_insert_owner`) devrait donc fournir un code lui-même. Pour que le client n'invente jamais de code (cohérent avec le principe RLS du projet : la sécurité, y compris la genèse d'un secret, vit en base), on ajoute un défaut :

```sql
alter table public.group_invitations
  alter column code set default encode(gen_random_bytes(4), 'hex');
```

8 caractères hexadécimaux (`gen_random_bytes` vient de `pgcrypto`, déjà activé). Le client insère `group_id`, `created_by`, `expires_at` et relit la ligne pour obtenir le `code` généré.

### 2.3 Garde anti-orphelin : `guard_owner_orphan()`

`budget_groups.owner_id` référence `users (id) on delete cascade` : supprimer le compte d'un propriétaire supprime son groupe, donc cascade jusqu'à `account_memberships` — un groupe partagé disparaît bien avec son propriétaire aujourd'hui, il n'y a pas d'exception pour les groupes à plusieurs membres. C'est précisément ce que la garde doit empêcher, mais une suppression de compte est une opération en cascade sur potentiellement plusieurs lignes `account_memberships` à la fois (celle du propriétaire et celles des co-membres), dans un ordre que Postgres ne garantit pas à l'intérieur d'une même instruction — un `exists(...)` ré-interrogeant les lignes sœurs à l'intérieur de ce même lot serait donc non déterministe.

La garde se limite donc à ce qu'elle peut trancher de façon fiable : **l'action volontaire, à une seule ligne, que cet écran expose** — un propriétaire qui se retire ou est rétrogradé alors que le groupe et d'autres membres existent encore. `pg_trigger_depth() = 0` distingue cette action directe d'une cascade (FK `on delete cascade`, quelle que soit son origine) : une cascade s'exécute toujours imbriquée dans le trigger système de la contrainte, donc à une profondeur supérieure à zéro.

```sql
create function public.guard_owner_orphan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  becomes_non_owner boolean;
begin
  becomes_non_owner := (tg_op = 'DELETE') or (new.role <> 'owner');

  if pg_trigger_depth() = 0 and old.role = 'owner' and becomes_non_owner then
    if exists (
      select 1 from public.account_memberships
       where group_id = old.group_id and user_id <> old.user_id
    ) then
      raise exception 'Le propriétaire ne peut pas quitter un groupe qui a d''autres membres';
    end if;
  end if;

  -- BEFORE UPDATE doit renvoyer new : renvoyer old annulerait silencieusement
  -- toute modification autorisée en réécrivant les anciennes valeurs. old ne
  -- convient que pour delete, qui n'a pas de new.
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger account_memberships_guard_owner_orphan
  before update or delete on public.account_memberships
  for each row execute function public.guard_owner_orphan();
```

- Retrait/rétrogradation volontaire du propriétaire (action de cet écran, toujours une seule ligne, `pg_trigger_depth() = 0`) avec d'autres membres encore présents → bloqué.
- Toute cascade (suppression du groupe par son propriétaire, ou suppression de compte) → `pg_trigger_depth() > 0` → la garde ne s'applique pas, la cascade va jusqu'au bout. **Conséquence acceptée pour ce lot de travail** : un propriétaire peut aujourd'hui contourner le blocage en supprimant son compte plutôt qu'en essayant de quitter le groupe. Fermer cette échappatoire demande une vérification faite *avant* de lancer la suppression de compte (dans le futur écran 8, quand cette fonctionnalité sera conçue), pas un trigger bas niveau qui course l'ordre d'un lot en cascade — hors périmètre ici (l'écran 8 n'existe pas encore).
- Bare `raise exception`, pas de code d'erreur explicite : suit le précédent de `guard_personal_group_membership()`. Tombe sur le message générique de `data-errors.ts`. L'UX réelle vient du bouton « Quitter » désactivé côté client (section 5), l'erreur base est un filet de sécurité.

## 3. Couche données — `src/data/groups.ts`

Ajouts, aucun ne redéfinit un type déjà généré :

```ts
export type GroupMember = {
  userId: string;
  displayName: string;
  email: string;
  role: MembershipRole;
};

export type GroupInvitation = {
  id: string;
  code: string;
  expiresAt: string;
};

export async function createSharedGroup(name: string): Promise<string>
export async function listGroupMembers(groupId: string): Promise<GroupMember[]>
export async function removeMember(groupId: string, userId: string): Promise<void>
export async function leaveGroup(groupId: string): Promise<void>
export async function joinGroupWithCode(code: string): Promise<string>
export async function getActiveInvitation(groupId: string): Promise<GroupInvitation | null>
export async function createInvitation(groupId: string): Promise<GroupInvitation>
export async function revokeInvitation(id: string): Promise<void>
```

- `createSharedGroup` → `supabase.rpc('create_shared_group', { name })`.
- `joinGroupWithCode` → `supabase.rpc('join_group_with_code', { invitation_code: code })`.
- `listGroupMembers` → `select role, users(id, display_name, email)` sur `account_memberships` filtré par `group_id` (RLS fait le reste).
- `removeMember`/`leaveGroup` → `delete` sur `account_memberships` filtré par `group_id` + `user_id` (owner ou soi-même — la policy tranche), avec `.select('id').single()` pour forcer une erreur si la ligne filtrée par RLS ne correspond à aucune ligne, même précédent que `deleteSavingsGoal`.
- `getActiveInvitation` → `select` sur `group_invitations` où `group_id = groupId`, `revoked_at is null`, `used_at is null`, `expires_at > now()`, la plus récente, `maybeSingle()`.
- `createInvitation` → `insert` avec `expires_at = now() + 7 jours` calculé côté client (`new Date(Date.now() + 7 * 86400_000).toISOString()`), relu avec `.select('id, code, expires_at').single()` pour récupérer le `code` généré par défaut en base.
- `revokeInvitation` → `update` : `revoked_at = now()`.

Pas de fonction `updateMemberRole` : YAGNI, section 1.

## 4. Hooks

- `use-group-mutations.ts` : `createGroup`, `joinGroup`, `removeMember`, `leaveGroup` — chacun invalide `queryKeys.memberships()` (le groupe actif ou la liste des groupes a pu changer).
- `use-group-members.ts` : lecture des membres d'un groupe (`useQuery`, clé `queryKeys.groupMembers(groupId)`).
- `use-group-invitation.ts` : `getActiveInvitation` + mutations `createInvitation`/`revokeInvitation`, invalidant la même clé `queryKeys.groupInvitation(groupId)`.
- Pas de nouveau hook Realtime : `account_memberships` est déjà dans la publication Realtime (CLAUDE.md). L'écran membres se contente d'un `refetchOnMount: 'always'`, comme l'écran d'activité — une liste de membres qui se réarrange sous le doigt pendant la lecture est aussi indésirable qu'une liste d'activité qui le ferait, et le trafic d'événements y est trop rare pour justifier un abonnement dédié.

`queryKeys.ts` ajoute :

```ts
groupMembers: (groupId: string) => ['groupMembers', groupId] as const,
groupInvitation: (groupId: string) => ['groupInvitation', groupId] as const,
```

Clés indépendantes de `['transactions']`/`['budgets']` : rien de ce qui les invalide aujourd'hui ne concerne les membres ou les invitations.

## 5. Écrans et composants

- **`src/app/(app)/groups.tsx`** (écran plein, accessible depuis le tableau de bord) : liste des groupes de `useActiveGroup().groups` (déjà chargée), pastille sur le groupe actif, tap = `setActiveGroupId`. Deux actions en pied de liste : « Créer un groupe partagé » et « Rejoindre un groupe », chacune une `formSheet`. Tap sur un groupe partagé ouvre son détail (`group.tsx?id=`) ; le compte personnel n'a pas de détail (aucun membre à gérer).
- **`src/app/(app)/group-create.tsx`** (`formSheet`) : un champ nom, bouton « Créer ». `onSuccess` → `setActiveGroupId(newGroupId)` puis `router.back()` : le groupe qu'on vient de créer devient le groupe actif, sinon l'utilisateur atterrirait sur son compte personnel sans comprendre pourquoi le nouveau groupe n'apparaît nulle part.
- **`src/app/(app)/group-join.tsx`** (`formSheet`) : un champ code (8 caractères). `join_group_with_code()` compare `code` par égalité stricte, sans normaliser la casse — le champ passe donc la saisie en minuscules (`code.trim().toLowerCase()`) avant l'appel, puisque `encode(...,'hex')` génère toujours des minuscules côté base. Bouton « Rejoindre », `onSuccess` → même bascule vers le groupe rejoint.
- **`src/app/(app)/group.tsx`** (`?id=`, écran plein, même famille que `budgets.tsx`) : nom du groupe, liste des membres (nom, rôle), bouton « Exclure » par ligne si l'utilisateur courant est owner et la ligne n'est pas la sienne, bloc invitation (code affiché + copier via `expo-clipboard`, ou bouton générer/régénérer), bouton « Quitter le groupe » — désactivé avec un texte explicatif si l'utilisateur est owner et qu'il reste d'autres membres (section 6).
- **`expo-clipboard`** : nouvelle dépendance (`npx expo install expo-clipboard`), un seul usage — bouton « Copier » à côté du code, retour visuel bref (« Copié ! ») plutôt qu'une alerte.
- Le tableau de bord (`index.tsx`) gagne l'entrée de menu vers `groups.tsx` qui manquait — le commentaire déjà présent dans ce fichier l'anticipe.

## 6. Gestion des erreurs

- La garde anti-orphelin ne remonte aucun code SQLSTATE dédié : elle tombe sur le message générique de `data-errors.ts` (`GENERIC`), comme `guard_personal_group_membership()`. C'est un filet, pas le mécanisme UX principal.
- Le bouton « Quitter le groupe » est désactivé côté client dès que `role === 'owner' && members.length > 1`, avec un texte explicatif affiché à la place de l'action plutôt qu'un bouton mort — même logique appliquée ailleurs dans l'app (une action impossible n'est pas juste bloquée, elle est expliquée).
- Un code d'invitation invalide/expiré/révoqué/déjà utilisé remonte le message d'erreur explicite déjà construit par `join_group_with_code()` (`raise exception` avec un texte dédié pour chaque cas, vu dans la migration existante) — rien à ajouter côté mapping, ces messages sont déjà en français et assez précis pour être affichés tels quels.
- Retirer le dernier membre autre que soi ou quitter un groupe où l'on est seul membre restant (non-owner) : couvert par `account_memberships_delete_owner_or_self`, aucune garde supplémentaire.

## 7. Tests

Nouveau fichier `supabase/tests/group_management_rls_test.sql` (aucun test n'existe aujourd'hui pour ces trois tables) :

- `create_shared_group()` crée le groupe et la ligne `owner` de façon atomique ; échoue sans session.
- La garde bloque un `delete`/`update` **direct** (`pg_trigger_depth() = 0`) sur la ligne `owner` quand le groupe a d'autres membres, et l'autorise quand il en est l'unique membre.
- La garde n'empêche pas la suppression complète du groupe (`delete from budget_groups`) même avec plusieurs membres — la cascade (`pg_trigger_depth() > 0`) doit passer jusqu'au bout, co-membres compris.
- Le défaut de `group_invitations.code` génère bien une valeur (non nulle, 8 caractères hex) sans que l'appelant la fournisse.
- `account_memberships_delete_owner_or_self` : un membre peut se retirer lui-même, ne peut pas retirer un autre membre ; un owner peut retirer un membre, ne peut pas être retiré par quelqu'un d'autre.
- `group_invitations_insert_owner` refuse un non-owner, refuse une `expires_at` dans le passé.

`npm test` (Jest) n'est pas concerné : aucune nouvelle logique pure isolée dans `src/lib/` — la génération du code et les gardes vivent en base.
