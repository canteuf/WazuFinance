import NetInfo from '@react-native-community/netinfo';
import {
  focusManager,
  MutationCache,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Alert, AppState, Platform, type AppStateStatus } from 'react-native';

import { PERSISTED_CACHE_MAX_AGE } from '@/hooks/use-persisted-query-cache';
import { registerTransactionMutationDefaults } from '@/hooks/use-transaction-mutations';
import { dataErrorMessage } from '@/lib/data-errors';

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
 * Même pont pour le réseau : sur natif, TanStack Query suppose la connexion toujours présente. Relié à NetInfo, il met les requêtes et les saisies en pause hors ligne, et recharge les unes et envoie les autres au retour du réseau. Sur le web, son détecteur par défaut (les événements `online`/`offline` du navigateur) suffit.
 *
 * `isConnected !== false` plutôt que `=== true` : NetInfo répond `null` tant qu'il n'a pas encore sondé l'interface, et considérer l'app hors ligne pendant ce délai mettrait en pause les premières requêtes du démarrage. `isInternetReachable` n'est pas consulté : il dépend d'un appel à un serveur de Google, et un faux négatif mettrait les saisies en file alors que le réseau fonctionne.
 */
if (Platform.OS !== 'web') {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(state.isConnected !== false))
  );
}

/**
 * Les saisies mises en file hors ligne sont envoyées plus tard, souvent après la fermeture du formulaire qui les a faites : si la base les refuse alors (catégorie supprimée entre-temps, accès retiré au groupe, opération modifiée par un autre membre), plus aucun écran n'est là pour afficher l'erreur. On retient donc les mutations passées par la pause, et c'est à elles seules qu'une alerte est réservée — une erreur sur une saisie envoyée tout de suite s'affiche déjà sous le formulaire, et l'alerte ferait doublon.
 */
function createMutationCache(): MutationCache {
  const queued = new WeakSet<object>();

  const cache = new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (queued.has(mutation)) {
        Alert.alert('Une opération n’a pas pu être envoyée', dataErrorMessage(error));
      }
    },
  });

  cache.subscribe((event) => {
    // Une mutation relue du disque au démarrage arrive déjà en pause (« added ») ; une saisie faite hors ligne le devient en cours de route (« updated »). Une saisie qui a buté sur un réseau instable (`failureCount`) est renvoyée seule après la fermeture de sa feuille : elle compte aussi.
    if (
      (event.type === 'added' || event.type === 'updated') &&
      (event.mutation.state.isPaused || event.mutation.state.failureCount > 0)
    ) {
      queued.add(event.mutation);
    }
  });

  return cache;
}

/**
 * Le QueryClient est créé dans un état pour survivre aux rendus sans être partagé entre plusieurs instances de l'app.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      mutationCache: createMutationCache(),
      defaultOptions: {
        queries: {
          // Realtime invalide déjà le cache sur changement distant : un rechargement périodique ferait double emploi.
          staleTime: 30_000,
          // Égal à l'âge maximal du cache écrit sur le téléphone (usePersistedQueryCache) : une requête sortie plus tôt de la mémoire disparaîtrait aussi du disque, et manquerait au prochain démarrage hors ligne.
          gcTime: PERSISTED_CACHE_MAX_AGE,
          retry: 1,
        },
        mutations: {
          // Hors ligne, une écriture échoue aussitôt avec « Pas de connexion » au lieu d'attendre indéfiniment derrière un bouton qui tourne. Seules les saisies d'opérations patientent en file ; elles le déclarent elles-mêmes (registerTransactionMutationDefaults).
          networkMode: 'always',
        },
      },
    });
    // Avant toute relecture du cache : une saisie restée en file et relue du disque retrouve sa fonction par sa clé, et doit la trouver déjà enregistrée.
    registerTransactionMutationDefaults(queryClient);
    return queryClient;
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
