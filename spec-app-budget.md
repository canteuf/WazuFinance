# Spécification — Wazu Finance

## 1. Vue d'ensemble

**Wazu Finance** est une application mobile de suivi budgétaire multi-utilisateurs. Chaque utilisateur a un compte personnel privé et peut, en plus, partager un budget commun avec d'autres personnes (couple, famille, colocation).

**Stack retenue :**
- Mobile : React Native + Expo
- Backend : Supabase (Postgres, authentification, Row Level Security, sync temps réel)

## 2. Fonctionnalités

### 2.1 Comptes et groupes

- Inscription et connexion par email (Supabase Auth)
- Chaque utilisateur a un profil personnel
- Un utilisateur peut créer ou rejoindre un "groupe de budget" (invitation par lien ou code)
- Un groupe peut avoir plusieurs membres, chacun avec un rôle (propriétaire, membre)
- Les transactions personnelles restent privées tant qu'elles ne sont pas rattachées à un groupe partagé

### 2.2 Transactions

- Saisie manuelle de dépenses et de revenus
- Champs : montant, catégorie, date, note, type (dépense/revenu), rattachement à un groupe ou compte perso
- Modification et suppression d'une transaction
- Historique filtrable par période, catégorie, groupe

### 2.3 Catégories

- Liste de catégories par défaut (alimentation, logement, transport, loisirs, santé, etc.)
- Création de catégories personnalisées
- Icône par catégorie pour la lisibilité visuelle

### 2.4 Budgets

- Définition d'un plafond par catégorie et par période (mensuel, hebdomadaire)
- Alerte quand un budget approche ou dépasse la limite (ex : 80 % et 100 %)
- Vue d'ensemble : budget prévu vs dépenses réelles par catégorie

### 2.5 Objectifs d'épargne

- Création d'un objectif avec montant cible et montant actuel
- Suivi de la progression (barre ou pourcentage)
- Possibilité de lier des versements à l'objectif

### 2.6 Vue patrimoine globale

- Vue consolidée : revenus totaux, dépenses totales, solde net, sur une période choisie
- Répartition des dépenses par catégorie (graphique)
- Comparaison entre périodes (ce mois vs mois précédent)
- Vue combinée si l'utilisateur fait partie de plusieurs groupes (perso + partagé)

## 3. Modèle de données

Tables principales :

- **users** : profil utilisateur (id, email, nom affiché)
- **budget_groups** : un groupe de budget (perso ou partagé), avec propriétaire
- **account_memberships** : table de liaison entre users et budget_groups, avec un rôle
- **transactions** : dépense ou revenu, liée à un utilisateur, un groupe et une catégorie
- **categories** : catégories de dépenses/revenus, avec icône
- **budgets** : plafond défini par catégorie, par groupe, par période
- **savings_goals** : objectifs d'épargne liés à un utilisateur

Un compte personnel privé est modélisé comme un groupe à un seul membre. Cela évite de dupliquer la logique entre "perso" et "partagé" : les mêmes règles d'accès (RLS) s'appliquent partout, seul le nombre de membres change.

## 4. Exigences techniques

### 4.1 Sécurité et accès aux données

- Authentification via Supabase Auth (email/mot de passe au minimum ; envisager OAuth Google/Apple pour réduire la friction à l'inscription)
- Row Level Security (RLS) sur toutes les tables sensibles : un utilisateur ne peut lire/modifier que les transactions des groupes dont il est membre
- Les invitations à un groupe doivent expirer ou être révocables

### 4.2 Synchronisation

- Sync temps réel entre appareils pour les budgets partagés (via Supabase Realtime), pour qu'un membre voie les dépenses de l'autre sans recharger l'app
- Gestion du mode hors-ligne : au minimum, permettre la saisie hors-ligne avec sync différée au retour de connexion (à discuter selon la complexité acceptable pour la V1)

### 4.3 Performance et UX

- Saisie d'une dépense en 3 taps maximum depuis l'écran principal (montant, catégorie, valider) : la vitesse de saisie détermine si les utilisateurs continuent d'utiliser l'app après la première semaine
- Chargement de l'historique paginé, pas tout d'un coup
- Formulaires avec valeurs par défaut intelligentes (dernière catégorie utilisée, date du jour pré-remplie)

## 5. Écrans principaux (à valider avant développement)

1. Connexion / inscription
2. Tableau de bord (vue patrimoine, résumé du mois)
3. Liste des transactions (avec filtres)
4. Ajout/édition d'une transaction
5. Budgets par catégorie
6. Objectifs d'épargne
7. Gestion du groupe (membres, invitations)
8. Paramètres du compte

## 6. Périmètre V1 (tranché)

**Inclus dans la V1 :**
- Saisie manuelle des transactions
- Budgets par catégorie avec alerte visuelle in-app (pas de notification push)
- Objectifs d'épargne
- Export de données (CSV, PDF) : à développer après les écrans principaux (transactions, budgets, objectifs), mais avant les notifications

**Exclu de la V1 :**
- Connexion bancaire automatique : nécessite un agrégateur (Plaid, ou Budget Insight/Powens en France), une conformité DSP2, et un coût API récurrent. Chantier séparé à évaluer une fois la V1 validée par l'usage.
- Multi-devises : pas de besoin identifié pour l'instant. Ajout simple a posteriori (colonne `currency` sur `transactions` et `budgets`) si le besoin apparaît, donc pas de raison de complexifier le schéma maintenant.
- Notifications push : nécessite Expo Notifications, la gestion des permissions iOS/Android, et un job côté serveur (edge function Supabase) qui vérifie les seuils. L'alerte visuelle in-app suffit pour la V1 ; les notifications viennent une fois le cœur de l'app stable.

## 7. État

Ce document a servi de base à l'implémentation, et reste la référence du périmètre et du modèle de données. Le périmètre V1 décrit ici est livré : tous les écrans, l'export CSV et PDF, et un build natif installé sur appareil. L'avancement écran par écran est dans [README.md](README.md) ; les règles de code et les pièges rencontrés en chemin, dans [CLAUDE.md](CLAUDE.md).
