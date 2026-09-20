import type { Href, ImperativeRouter } from 'expo-router';

/**
 * Retour arrière qui survit à une ouverture directe de l'écran.
 *
 * `router.back()` seul suppose qu'il existe un écran précédent. Sur le web, après un rechargement sur une URL profonde (ou en arrivant par un lien), la pile ne contient que l'écran courant : l'action GO_BACK n'est traitée par personne et le bouton « retour » ne fait rien.
 *
 * On retombe donc sur `dismissTo(fallback)`, qui remonte la pile jusqu'à la route visée si elle s'y trouve, et remplace l'écran courant sinon — dans les deux cas l'utilisateur atterrit là où le retour l'aurait mené.
 *
 * Le routeur est passé en argument plutôt que lu par `useRouter()` ici : `src/lib/` reste sans dépendance à React, et la fonction se teste seule.
 */
export function goBackOr(router: ImperativeRouter, fallback: Href): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.dismissTo(fallback);
}
