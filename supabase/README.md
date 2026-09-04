# Supabase — Wazu Finance

Migrations à appliquer dans l'ordre, une seule fois, sur un projet Supabase neuf.

| Fichier | Contenu |
| --- | --- |
| `migrations/20260904000100_schema.sql` | Types, tables, index, triggers, publication Realtime |
| `migrations/20260904000200_policies.sql` | Helpers d'appartenance, RLS, `join_group_with_code()` |
| `migrations/20260904000300_seed_categories.sql` | Catégories par défaut (idempotent) |

## Application

**Dashboard** — SQL Editor, coller le contenu de chaque fichier dans l'ordre, exécuter.

**CLI** — depuis la racine du dépôt :

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

## Réglages du projet à vérifier

- **Authentication > Providers > Email** activé.
- **Confirm email** : si activé, l'inscription ne crée pas de session tout de suite ; l'app affiche alors un message demandant de confirmer l'email. Le désactiver accélère les tests en développement.
- **Minimum password length** : l'app valide 8 caractères côté client (`src/lib/validation.ts`) ; aligner le réglage Supabase pour éviter deux règles divergentes.

## Points de conception

**Le compte personnel est un `budget_group` à un seul membre.** Il n'y a pas de table séparée : les mêmes policies couvrent le perso et le partagé. Le trigger `handle_new_user()` crée profil + groupe personnel + adhésion `owner` dans la transaction d'inscription, donc l'app ne rencontre jamais un utilisateur sans groupe.

**Les helpers RLS sont `SECURITY DEFINER`.** Une policy sur `account_memberships` qui interroge `account_memberships` récurse à l'infini. `is_group_member()` et `is_group_owner()` lisent la table en contournant RLS et coupent la récursion.

**Rejoindre un groupe passe par `join_group_with_code()`.** Le futur membre n'a pas encore le droit de lire les invitations du groupe ; la fonction vérifie expiration, révocation et usage unique, puis insère l'adhésion.

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
