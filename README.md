# Wazu Finance

Application mobile de suivi budgétaire à plusieurs. Chaque utilisateur a un compte personnel privé et peut partager un budget commun avec d'autres personnes (couple, famille, colocation).

La spécification fonctionnelle complète est dans [spec-app-budget.md](spec-app-budget.md).

## Avancement

| Écran | État |
|---|---|
| 1. Connexion / inscription | Livré |
| 2. Tableau de bord : solde de la période, comparaison avec la précédente, répartition par catégorie, dernières opérations, accès aux budgets | Livré |
| 3. Historique des opérations : pagination et filtres par période, catégorie et type | Livré |
| 4. Ajout et modification d'une opération, en trois appuis depuis l'écran principal | Livré |
| 5. Budgets par catégorie : alerte à 80 % et à 100 % du plafond | Livré |
| Journal d'activité : qui a modifié ou supprimé quoi dans un budget partagé | Livré |
| 6. Objectifs d'épargne | Livré |
| 7. Gestion du groupe : membres, invitations | Livré |
| 8. Paramètres du compte | Livré |
| Export CSV / PDF | Livré |

Le périmètre V1 est complet. L'application tourne en build natif : APK installé et vérifié sur Pixel 7 et Galaxy S21 Ultra.

Hors V1, par décision : connexion bancaire, multi-devises, notifications push. Les raisons sont dans la spec, §6.

## Stack

- **Mobile** : React Native 0.86 + Expo SDK 57, expo-router v6 (routes typées), React 19.2, TypeScript strict
- **Données** : TanStack Query v5 pour le cache, Supabase pour Postgres, l'authentification, la Row Level Security et le temps réel
- **Tests** : Jest (modules purs) et pgTAP (base de données)

## Démarrer

Prérequis :
- Node.js ;
- un projet Supabase ;
- Expo Go ou un build de développement sur téléphone ;
- Docker Desktop, pour les tests de base de données uniquement ;
- `eas-cli` en global et les platform-tools Android, pour produire et installer un APK.

1. Installer les dépendances :

   ```bash
   npm install
   ```

2. Créer `.env` à partir de `.env.example` et y mettre l'URL et la clé anon du projet Supabase (Settings > API) :

   ```bash
   EXPO_PUBLIC_SUPABASE_URL=https://votre-ref.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=votre-cle-anon
   ```

   Ces deux valeurs sont publiques et se retrouvent en clair dans l'application : la sécurité repose sur les policies RLS. **Ne jamais mettre la clé `service_role` dans une variable `EXPO_PUBLIC_`.**

3. Appliquer les migrations au projet Supabase :

   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```

   Les réglages d'authentification à vérifier sont décrits dans [supabase/README.md](supabase/README.md).

4. Lancer l'application :

   ```bash
   npx expo start --clear
   ```

   `--clear` est nécessaire après toute modification de `.env` : les variables sont intégrées au moment du build.

## Commandes

| Commande | Rôle |
|---|---|
| `npm start` | Serveur de développement Expo |
| `npm run android` / `npm run web` | Lancer directement sur Android ou dans le navigateur |
| `npm run lint` | ESLint (`eslint-config-expo`) |
| `npx tsc --noEmit` | Vérification des types |
| `npm test` | Tests Jest des modules purs de `src/lib/` |
| `npx supabase start` | Base locale, toutes migrations appliquées (Docker requis) |
| `npm run test:db` | Tests pgTAP de `supabase/tests/` contre la base locale |
| `npx supabase db reset` | Réapplique les migrations à la base locale |
| `npx supabase migration list --linked` | Compare migrations locales et distantes |
| `npm run db:types` | Régénère `src/types/database.ts` depuis le projet lié, après une migration |
| `npx expo export --platform android --output-dir <dossier>` | Vérifie que le bundle se construit, sans appareil |
| `eas build -p android --profile preview` | APK installable sur un appareil, construit par EAS (`eas-cli` installé globalement) |

## Build natif (EAS)

Expo Go suffit pour développer, mais pas pour valider : le partage de fichiers, l'impression PDF et les modules natifs s'y comportent autrement que dans une app installée. Le profil `preview` de [eas.json](eas.json) produit un APK qu'on installe directement sur un appareil, sans passer par le Play Store.

```bash
npm install -g eas-cli                          # une fois, outil de développement, pas une dépendance du projet
eas login                                       # une fois, compte expo.dev
eas init                                        # une fois, crée le projectId dans app.json
eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value <url> --environment preview --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <cle> --environment preview --visibility plaintext
eas build -p android --profile preview          # ~10-20 min, QR code à la fin
```

`eas-cli` s'installe globalement et **ne doit pas figurer dans les dépendances du projet** : EAS exécute `npm ci --include=dev` sur le serveur de build, où ces 344 paquets n'ont rien à faire. La version attendue est verrouillée par le champ `cli.version` de [eas.json](eas.json), pas par une dépendance.

Les deux variables sont indispensables : `.env` n'est pas versionné, donc EAS ne le voit pas, et [src/lib/env.ts](src/lib/env.ts) lève une erreur au démarrage si l'une manque. Elles sont publiques par conception — la sécurité repose sur les policies RLS, jamais sur le secret de la clé anon — d'où `--visibility plaintext`. Ne jamais y mettre la clé `service_role`.

Le premier build demande un keystore de signature : laisser EAS le générer et le conserver, c'est lui qui servira à toutes les mises à jour de l'app.

Les trois profils de [eas.json](eas.json) fixent `"node": "22.20.0"`. Ce n'est pas un détail de confort : `@supabase/supabase-js` déclare `engines.node >= 22`, React Native veut `^20.19.4 || ^22.13.0 || ^24.3.0`, et l'intersection commence à 22.13. Sans ce réglage, le serveur de build prend Node 20 et `npm ci` s'arrête sur un conflit de moteur — un échec en quinze secondes, dont le journal ne montre que `npm ci --include=dev exited with non-zero code: 1`.

Installer l'APK sur un appareil demande `adb`, qui vient des [platform-tools Android](https://developer.android.com/tools/releases/platform-tools). Sans lui, le build aboutit mais l'installation automatique échoue sur `spawn adb ENOENT` ; l'APK reste téléchargeable depuis le lien affiché.

## Architecture

```
src/app/          routes expo-router : (auth) sans session, (app) avec session
src/components/   composants d'interface, par domaine
src/hooks/        accès aux données pour les écrans (TanStack Query)
src/data/         requêtes Supabase, sans React
src/lib/          modules purs : montants, dates, erreurs, clés de cache, progression des budgets
src/providers/    session, groupe actif, cache
src/theme/        jetons de couleur, typographie, espacements
src/types/        types générés depuis la base (ne pas éditer à la main)
assets/images/    icônes de l'app, écran de démarrage, favicon
supabase/         migrations SQL, policies RLS, tests pgTAP
docs/superpowers/ specs de conception, écran par écran
.github/workflows/ sauvegarde nocturne de la base et maintien en activité du projet Supabase
```

Principes structurants :

- **Les dépendances vont dans un seul sens** : `écrans → hooks → src/data/ → Supabase`. Un écran n'importe jamais le client Supabase.
- **Un compte personnel est un groupe à un seul membre.** Personnel et partagé passent par les mêmes tables et les mêmes policies.
- **La sécurité vit en base.** Chaque policy RLS se ramène à « l'appelant est-il membre de ce groupe ? ». Aucun filtre côté client n'en tient lieu.
- **Les sommes sont calculées par Postgres**, qui additionne exactement les montants `numeric(12,2)`, là où JavaScript passerait par des nombres flottants.
- **La période budgétaire suit le jour de paie** : `period_start_day`, du 1 au 28, est réglé par groupe. Les bornes de période sont calculées côté client.
- **L'historique est paginé par curseur** sur `(date, id)`, jamais par décalage, pour qu'une opération ajoutée en temps réel ne décale pas les pages.
- **L'app fonctionne hors ligne** : le cache est conservé sur le téléphone, et les saisies d'opérations sont mises en file d'attente puis envoyées au retour du réseau. Les autres écritures échouent tout de suite avec « Pas de connexion ».

Les règles détaillées et les pièges déjà rencontrés sont dans [CLAUDE.md](CLAUDE.md).

## Sauvegardes (GitHub Actions)

Le plan gratuit de Supabase n'offre pas de sauvegarde téléchargeable et met un projet en pause après 7 jours d'inactivité. Deux workflows y répondent :

- [db-backup.yml](.github/workflows/db-backup.yml), chaque nuit à 02:00 UTC : export complet (rôles, schéma, données), chiffré avec `gpg`, conservé 30 jours comme artefact. La procédure de restauration est en tête du fichier.
- [db-keepalive.yml](.github/workflows/db-keepalive.yml), tous les deux jours : une vraie requête SQL.

Secrets du dépôt : `SUPABASE_DB_URL`, la chaîne **Session pooler** (dashboard → Connect), encodée en pourcentage, et `BACKUP_PASSPHRASE`, à conserver aussi hors de GitHub : sans elle, les sauvegardes sont illisibles.

## Maintenance des dépendances

Mettre à jour uniquement avec :

```bash
npx expo install --fix
```

**Ne jamais lancer `npm audit fix --force`.** npm choisit la première version hors de la plage vulnérable sans tenir compte du SDK : il a déjà rétrogradé `expo` en version 46, et l'application ne démarrait plus. Les alertes modérées restantes viennent de paquets que le SDK apporte lui-même. Elles disparaissent avec les correctifs d'Expo, que `npx expo install --fix` récupère.

Si `npx expo install --fix` échoue sur `EALLOWSCRIPTS` (« --allow-scripts is not allowed in project-scoped installs »), c'est qu'un `~/.npmrc` contient une ligne `allow-scripts`, que npm 11.19 refuse quand Expo lance l'installation. Lancer alors `npx expo install --check`, qui liste les versions attendues, puis les installer avec `npm install <paquet>@<version>`.

## Licence

MIT — voir [LICENSE](LICENSE).
