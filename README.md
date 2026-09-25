# Wazu Finance

**Wazu Finance est une application mobile pour suivre son argent, seul ou à plusieurs.**

Chaque personne dispose d'un compte personnel, visible d'elle seule. Elle peut aussi tenir un budget commun avec d'autres : en couple, en famille ou en colocation. Chacun y note ses dépenses, et tout le monde voit les mêmes chiffres, mis à jour en direct.

Les montants sont en francs CFA (XAF), sans centimes.

## Aperçu

<table>
  <tr>
    <td align="center" width="33%"><img src="docs/screenshots/synthese.png" alt="Écran Synthèse : solde du mois, entrées, sorties et répartition des dépenses par catégorie" width="240"><br><sub><b>Synthèse</b> : le mois en un coup d'œil</sub></td>
    <td align="center" width="33%"><img src="docs/screenshots/saisie.png" alt="Formulaire de saisie : montant de 12 500 XAF et catégorie Alimentation sélectionnée" width="240"><br><sub><b>Saisie</b> : montant, catégorie, valider</sub></td>
    <td align="center" width="33%"><img src="docs/screenshots/operations.png" alt="Écran Opérations : recherche, filtres et opérations regroupées par jour" width="240"><br><sub><b>Opérations</b> : l'historique, jour par jour</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/budgets.png" alt="Écran Budgets : synthèse des enveloppes et une enveloppe Restaurants en dépassement" width="240"><br><sub><b>Budgets</b> : les enveloppes et leurs alertes</sub></td>
    <td align="center"><img src="docs/screenshots/epargne.png" alt="Écran Épargne : total mis de côté et progression de chaque objectif" width="240"><br><sub><b>Épargne</b> : la progression des objectifs</sub></td>
    <td align="center"><img src="docs/screenshots/groupe.png" alt="Détail d'un groupe partagé : membres et code d'invitation" width="240"><br><sub><b>Groupe</b> : un budget partagé à deux</sub></td>
  </tr>
</table>

<sub>Captures réalisées avec des données fictives.</sub>

## Ce que fait l'application

### Noter une dépense en trois gestes

Depuis l'écran d'accueil, le bouton **Saisie** ouvre le formulaire : on tape le montant, on choisit la catégorie, on valide. La date du jour et la dernière catégorie utilisée sont déjà remplies, et restent modifiables. On peut aussi noter un revenu, ajouter une note, puis corriger ou supprimer une opération plus tard.

### Voir où en est son mois

L'écran **Synthèse** résume la période en cours :

- le solde, c'est-à-dire les revenus moins les dépenses ;
- la différence avec la période précédente ;
- la répartition des dépenses par catégorie, en barres ;
- les dernières opérations.

Le mois budgétaire n'a pas besoin de commencer le 1er : on choisit le jour qui correspond à sa paie, du 1 au 28.

### Retrouver une opération

L'écran **Opérations** liste tout l'historique, jour par jour, avec le total de chaque journée. On peut le filtrer par période, par type (dépense ou revenu) et par catégorie, ou chercher un mot.

### Classer ses dépenses

L'application propose des catégories courantes, chacune avec son icône : alimentation, logement, transport, loisirs, santé, etc. On peut créer les siennes directement dans le formulaire de saisie.

### Fixer des limites avec les enveloppes

L'écran **Budgets** permet de fixer un plafond de dépenses par catégorie pour le mois (une « enveloppe »). Chaque enveloppe montre ce qui a été dépensé et ce qui reste, et l'application prévient visuellement à deux seuils :

- **à 80 %** du plafond, l'enveloppe passe en alerte ;
- **à 100 %**, elle est signalée comme dépassée.

Les enveloppes les plus urgentes s'affichent en premier, et une synthèse donne le total dépensé face au total prévu.

### Mettre de l'argent de côté

L'écran **Épargne** sert à suivre des objectifs : un voyage, un fonds d'urgence, un équipement. Pour chacun, on fixe le montant visé et, si on le souhaite, une date. On y ajoute des versements au fil du temps, et une barre montre la progression. L'application calcule aussi combien mettre de côté chaque mois pour tenir les échéances.

Les objectifs d'épargne restent personnels, même à l'intérieur d'un budget partagé.

### Partager un budget

On peut créer un groupe et y inviter d'autres personnes avec un **code d'invitation**. Ce code ne sert qu'une fois et expire au bout d'un certain temps ; le créateur du groupe peut en générer un nouveau à tout moment. Dans un groupe partagé :

- chaque membre voit les dépenses des autres **en direct**, sans recharger l'application ;
- le **journal** indique qui a modifié ou supprimé quoi, et quand ;
- le créateur du groupe gère les membres et peut en retirer un.

On passe d'un groupe à l'autre, ou de son compte personnel à un budget commun, depuis l'écran **Mes groupes**.

### Exporter ses données

Depuis l'écran Opérations, le bouton **Exporter** produit un fichier des opérations affichées :

- en **CSV**, pour les ouvrir dans un tableur (Excel, Google Sheets…) ;
- en **PDF**, pour un relevé lisible, à imprimer ou à partager.

### Continuer sans réseau

L'application reste utilisable sans connexion. Elle affiche les derniers chiffres connus, et les dépenses saisies hors ligne sont mises de côté puis envoyées automatiquement au retour du réseau. Un bandeau indique qu'on est hors ligne et combien de saisies attendent leur envoi.

### Régler son compte

Dans les **Paramètres**, on peut :

- choisir un avatar parmi dix-sept visages, ou garder ses initiales ;
- changer son nom affiché et son mot de passe ;
- choisir le thème clair, sombre, ou celui du téléphone ;
- régler le jour de début du mois budgétaire ;
- se déconnecter, ou supprimer définitivement son compte.

L'application suit aussi la taille de texte choisie dans les réglages du téléphone.

## Confidentialité et sécurité

- **Ce qui est personnel reste personnel.** Une dépense de votre compte personnel n'est visible par personne d'autre. Dans un groupe partagé, seuls ses membres voient ses opérations.
- **La protection est assurée par le serveur, pas seulement par l'application.** Même quelqu'un qui contournerait l'application ne pourrait pas lire les données d'un groupe dont il n'est pas membre.
- **Rien ne reste sur le téléphone après une déconnexion.** Les données gardées pour le mode hors ligne sont effacées.
- **Les données sont sauvegardées chaque nuit**, et ces sauvegardes sont chiffrées.

## Ce qui n'est pas prévu pour l'instant

Ces fonctions ont été écartées de la première version, chacune pour une raison précise :

- **La connexion automatique à sa banque** : elle demande un intermédiaire payant et une mise en conformité réglementaire. Elle sera étudiée une fois l'application validée par l'usage.
- **Plusieurs devises** : aucun besoin identifié à ce jour, le franc CFA suffit.
- **Les notifications sur le téléphone** : les alertes visibles dans l'application suffisent pour commencer.

## Version actuelle

**Version 1.0.0** : toutes les fonctionnalités ci-dessus sont disponibles. L'application a été installée et testée sur Android (Pixel 7 et Galaxy S21 Ultra).

## Pour les développeurs

L'application est construite avec React Native et Expo, et ses données sont hébergées sur Supabase.

- Installation, commandes, compilation Android, architecture et sauvegardes : [docs/developpement.md](docs/developpement.md)
- Spécification fonctionnelle complète : [spec-app-budget.md](spec-app-budget.md)
- Règles de code et pièges déjà rencontrés : [CLAUDE.md](CLAUDE.md)

## Licence

MIT, voir [LICENSE](LICENSE).
