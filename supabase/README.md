# Supabase — Wazu Finance

Les migrations s'appliquent dans l'ordre, une seule fois chacune. Leur nom suit le format de la CLI, `<horodatage à 14 chiffres>_nom.sql` : `npx supabase db push` ignore un fichier nommé autrement.

| Fichier | Contenu |
| --- | --- |
| `migrations/20260904000100_schema.sql` | Types, tables, index, triggers (`updated_at`, provisionnement à l'inscription), publication Realtime |
| `migrations/20260904000200_policies.sql` | Helpers d'appartenance, RLS, privilèges, `join_group_with_code()` |
| `migrations/20260904000300_seed_categories.sql` | Catégories par défaut (idempotent) |
| `migrations/20260904000400_harden_personal_group_guard.sql` | Rend le garde du compte personnel indépendant de l'ordre des cascades. Sans cette migration, la suppression d'un compte pouvait échouer. |
| `migrations/20260908000100_period_summary.sql` | `budget_groups.period_start_day` (1 à 28) et `period_summary()` : entrées, sorties et solde d'une période |
| `migrations/20260909000100_category_breakdown.sql` | `category_breakdown()` : dépenses d'une période, par catégorie |

## Application

**CLI**, depuis la racine du dépôt :

```bash
npx supabase link --project-ref <ref>
npx supabase migration list --linked   # ce qui reste à appliquer
npx supabase db push
```

**Dashboard**, sur un projet neuf : dans le SQL Editor, coller le contenu de chaque fichier dans l'ordre et l'exécuter.

Après chaque migration, régénérer les types de l'application depuis le projet lié, **une fois la migration poussée** :

```bash
npm run db:types
```

Ce script remet lui-même l'en-tête et les alias d'enums, et écrit en UTF-8. Ne pas rediriger `supabase gen types` vers le fichier à la main : la redirection perd les deux, et sous PowerShell elle écrit en UTF-16, après quoi tsc ne trouve plus aucun export. Toujours partir de `--linked`, jamais de `--local` : la pile locale tourne une autre version de PostgREST et omet le bloc `__InternalSupabase`.

## Réglages du projet à vérifier

- **Authentication > Providers > Email** activé.
- **Confirm email** : s'il est activé, l'inscription ne crée pas tout de suite de session, et l'app demande de confirmer l'email. Le désactiver accélère les tests en développement.
- **Minimum password length** : l'app exige 8 caractères côté client (`src/lib/validation.ts`). Régler Supabase sur la même valeur, pour ne pas avoir deux règles différentes.

## Points de conception

**Le compte personnel est un `budget_group` à un seul membre.** Il n'y a pas de table séparée : les mêmes policies couvrent le personnel et le partagé. Le trigger `handle_new_user()` crée le profil, le groupe personnel et l'adhésion `owner` dans la transaction d'inscription : l'app ne rencontre jamais un utilisateur sans groupe.

**Les helpers RLS sont `SECURITY DEFINER`.** Une policy sur `account_memberships` qui interroge `account_memberships` s'appelle elle-même à l'infini. `is_group_member()` et `is_group_owner()` lisent la table sans passer par RLS, ce qui coupe cette boucle.

**Les agrégats sont `SECURITY INVOKER`.** `period_summary()` et `category_breakdown()` lisent `transactions` sous ses policies ordinaires : un non-membre obtient zéro ou un résultat vide, sans rien à contourner ni à auditer. `SECURITY DEFINER` ne se justifie que pour sortir d'une récursion, comme dans le cas précédent.

**Les bornes de période viennent du client**, sous forme d'intervalle semi-ouvert [début, fin). Le serveur est en UTC : un `date_trunc` sur `now()` se tromperait de période pendant les premières heures du jour de bascule.

**Rejoindre un groupe passe par `join_group_with_code()`.** Le futur membre n'a pas encore le droit de lire les invitations du groupe. La fonction vérifie donc elle-même l'expiration, la révocation et l'usage unique, puis crée l'adhésion.

## Tests

Tests pgTAP, exécutés contre la base locale. Docker Desktop doit être démarré.

```bash
npx supabase start    # applique toutes les migrations sur une base neuve
npm run test:db
npx supabase db reset # après l'ajout ou la modification d'une migration
```

| Fichier | Ce qu'il prouve |
| --- | --- |
| `tests/handle_new_user_test.sql` | Provisionnement à l'inscription, garde du compte personnel, suppression de compte en cascade |
| `tests/transactions_rls_test.sql` | Isolation des transactions entre groupes |
| `tests/transaction_paging_test.sql` | Pagination par curseur `(occurred_on, id)`, y compris quand plusieurs lignes ont la même date |
| `tests/period_summary_test.sql` | Totaux de période, bornes semi-ouvertes, résultat nul pour un non-membre |
| `tests/category_breakdown_test.sql` | Agrégation par catégorie, tri, exclusion des revenus, résultat vide pour un non-membre |
| `tests/budgets_rls_test.sql` | Policies de `budgets`, unicité par catégorie, plafond strictement positif |

Si `handle_new_user()` échoue, le client ne reçoit qu'un message opaque, « Database error saving new user ». Toute modification de `users`, `budget_groups` ou `account_memberships` doit donc repasser `npm run test:db`.

## Vérifier les policies

```sql
-- Aucune table sans RLS
select tablename
  from pg_tables
 where schemaname = 'public'
   and rowsecurity = false;

-- Policies en place
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;
```
