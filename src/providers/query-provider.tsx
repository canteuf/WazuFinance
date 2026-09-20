import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

/**
 * Sans ce pont, TanStack Query s'appuie sur son détecteur de focus par défaut (l'événement web `visibilitychange`), qui n'existe pas sur natif : après une longue mise en arrière-plan, un dashboard resté monté ne revalide jamais au retour au premier plan, même avec un staleTime dépassé. Configuration React Native documentée par TanStack Query.
 *
 * Distinct de l'écouteur AppState de src/lib/supabase.ts, qui gère le rafraîchissement du jeton d'authentification — un souci différent. Ne pas fusionner les deux : ce module n'a pas besoin de connaître Supabase, et inversement.
 */
function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}

AppState.addEventListener('change', onAppStateChange);

/**
 * Le QueryClient est créé dans un état pour survivre aux rendus sans être partagé entre plusieurs instances de l'app.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Realtime invalide déjà le cache sur changement distant : un rechargement périodique ferait double emploi.
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
