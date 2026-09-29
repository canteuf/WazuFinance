import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';

import { env } from '@/lib/env';
import { scrubEvent } from '@/lib/error-scrub';

/**
 * Suivi des plantages (Sentry).
 *
 * Actif seulement dans un APK (pas en développement, où l'erreur s'affiche déjà à l'écran) et seulement quand `EXPO_PUBLIC_SENTRY_DSN` est renseignée : sans elle, l'app fonctionne exactement pareil, sans rien envoyer.
 *
 * Une app de budget ne doit rien laisser partir de ce qu'on y saisit. Sentry reçoit l'erreur, sa pile, le modèle du téléphone et l'identifiant du compte (un UUID, jamais l'email). Les fils d'Ariane qui pourraient porter une donnée sont retirés : les touchers (leurs libellés d'accessibilité disent « Dépense de 5 000 francs CFA »), la console, et la partie après « ? » des adresses appelées, où passent la recherche dans les notes et les filtres. Chaque rapport passe enfin par `scrubEvent()` (error-scrub.ts), qui retire l'objet d'erreur joint et les valeurs que Postgres recopie dans ses messages.
 */

let enabled = false;

export function initMonitoring(): void {
  if (__DEV__ || !env.sentryDsn) {
    return;
  }
  Sentry.init({
    dsn: env.sentryDsn,
    sendDefaultPii: false,
    attachScreenshot: false,
    tracesSampleRate: 0,
    // Le canal EAS Update (preview, production) sépare les erreurs des APK de test de celles des utilisateurs.
    environment: Updates.channel ?? 'unknown',
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console' || breadcrumb.category?.startsWith('ui.') || breadcrumb.category === 'touch') {
        return null;
      }
      if ((breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') && breadcrumb.data) {
        const url = breadcrumb.data.url;
        if (typeof url === 'string') {
          breadcrumb.data.url = url.split('?')[0];
        }
      }
      return breadcrumb;
    },
  });
  enabled = true;
}

/** L'identifiant du compte seulement, pour savoir si une erreur touche une personne ou cent. */
export function setMonitoringUser(userId: string | null): void {
  if (enabled) {
    Sentry.setUser(userId ? { id: userId } : null);
  }
}

/** Pour les erreurs rattrapées que l'app surmonte seule (session illisible…) : l'utilisateur ne voit rien, mais on veut savoir que ça arrive. */
export function reportError(error: unknown, where: string): void {
  if (enabled) {
    Sentry.captureException(error, { tags: { where } });
  }
}

/** N'enveloppe l'app que si le suivi est actif : sans `init`, `Sentry.wrap` avertit à chaque démarrage en développement. À appeler après `initMonitoring()`. */
export function wrapRoot<P extends Record<string, unknown>>(component: React.ComponentType<P>): React.ComponentType<P> {
  return enabled ? Sentry.wrap(component) : component;
}
