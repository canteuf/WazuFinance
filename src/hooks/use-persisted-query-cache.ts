import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { useQueryClient } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSubscribe,
  type PersistQueryClientOptions,
} from '@tanstack/react-query-persist-client';
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { deserializeCache, serializeCache } from '@/lib/cache-serialization';
import { mutationKeys } from '@/lib/query-keys';

const STORAGE_PREFIX = 'query-cache:';

/**
 * Format du cache écrit, ajouté à la version de l'app dans le `buster`. À incrémenter quand l'écriture change sans nouvelle version de l'app : un cache au format précédent est alors jeté au lieu d'être relu. Passé à 2 quand les `Map` ont cessé d'être écrites comme `{}` (cache-serialization.ts) — les caches déjà écrits les contenaient vides et faisaient planter l'historique et l'épargne.
 */
const CACHE_FORMAT = 2;

/**
 * Âge maximal d'un cache relu au démarrage. Trente jours et non une semaine : le cache porte aussi les saisies restées en file, et un téléphone laissé une semaine sans réseau ni ouverture les aurait perdues avec lui. Les données affichées, elles, sont rechargées dès que le réseau revient — leur âge ne compte que hors ligne. Doit rester égal au `gcTime` du provider, sinon une requête sortie du cache mémoire disparaît aussi du disque.
 */
export const PERSISTED_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/**
 * Supprime les caches écrits pour d'autres utilisateurs que `keep`. Un cache ne survit pas à la déconnexion : c'est la même frontière que le vidage en mémoire, étendue au disque, pour qu'un téléphone prêté ou revendu ne garde pas les comptes de quelqu'un d'autre. Balayer par préfixe rattrape aussi une déconnexion interrompue avant la fin.
 */
async function discardOtherCaches(keep: string | null): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter(
      (key) => key.startsWith(STORAGE_PREFIX) && (keep === null || key !== storageKey(keep))
    );
    if (stale.length > 0) {
      await AsyncStorage.multiRemove(stale);
    }
  } catch {
    // Un balayage manqué sera refait au prochain changement de session ; il ne bloque rien.
  }
}

/**
 * Cache TanStack Query conservé sur le téléphone, un par utilisateur, et vidé au changement de compte. Renvoie vrai une fois le cache de l'utilisateur courant relu : le splash attend ce moment, sans quoi un démarrage hors ligne afficherait des écrans vides au lieu des derniers chiffres connus.
 *
 * Le cache est relu et écrit sous une clé propre à l'utilisateur, jamais sous une clé commune : la session et le cache se lisent en parallèle au démarrage, et une clé commune aurait pu restituer brièvement les données du compte précédent à un nouveau compte.
 *
 * Au changement d'utilisateur, le vidage en mémoire garantit qu'un second compte sur le même appareil ne voit jamais, même brièvement via stale-while-revalidate, les groupes ou transactions du précédent — les clés de cache ne sont pas scindées par utilisateur.
 */
export function usePersistedQueryCache(): boolean {
  const { session, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  // undefined tant qu'aucun rendu n'a encore relevé l'utilisateur courant.
  const previousUserId = useRef<string | null | undefined>(undefined);
  // L'utilisateur dont le cache a été relu ; undefined avant la première relecture. Sans session, il n'y a rien à relire.
  const [restoredFor, setRestoredFor] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Tant que isLoading est vrai, le null de session est un placeholder en attente de la lecture async de la session persistée, pas une absence de session observée : on ne baseline la référence qu'une fois résolue, sinon le premier utilisateur déjà connecté déclenche un clear au démarrage.
    if (isLoading) {
      return;
    }
    // On ignore le premier rendu résolu : ce n'est pas un changement d'utilisateur, seulement la lecture initiale de la session persistée. Le nettoyage de l'effet précédent a déjà détaché la persistance de l'ancien compte : ce vidage n'atteint pas son cache sur le disque, que discardOtherCaches supprime.
    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      queryClient.clear();
    }
    previousUserId.current = userId;

    void discardOtherCaches(userId);

    if (userId === null) {
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const options: PersistQueryClientOptions = {
      queryClient,
      persister: createAsyncStoragePersister({
        storage: AsyncStorage,
        key: storageKey(userId),
        serialize: serializeCache,
        deserialize: deserializeCache,
      }),
      maxAge: PERSISTED_CACHE_MAX_AGE,
      // Une nouvelle version de l'app peut changer la forme des données en cache : on repart alors d'un cache vide plutôt que de relire un format qu'aucun écran n'attend plus. Les saisies en file sont perdues avec lui — une mise à jour se télécharge en ligne, donc en pratique après leur envoi.
      buster: `${Constants.expoConfig?.version ?? ''}#${CACHE_FORMAT}`,
      dehydrateOptions: {
        // Seules les écritures sur les opérations ont une fonction enregistrée sous leur clé (registerTransactionMutationDefaults) : toute autre écriture relue au démarrage ne saurait pas quoi exécuter.
        shouldDehydrateMutation: (mutation) =>
          mutation.state.isPaused &&
          mutation.options.mutationKey?.[0] === mutationKeys.transactionWrites()[0],
      },
    };

    // Relecture puis abonnement, en deux temps plutôt que `persistQueryClient()` : celui-ci ne s'abonne pas quand la relecture échoue, et le cache n'aurait plus été écrit du tout jusqu'au redémarrage suivant.
    void persistQueryClientRestore(options)
      .catch(() => {
        // Cache illisible : la bibliothèque l'a déjà supprimé, l'app repart d'un cache vide. Un cache périmé ou d'une autre version, lui, est supprimé sans lever.
      })
      .then(() => {
        if (cancelled) {
          return;
        }
        unsubscribe = persistQueryClientSubscribe(options);
        // Les saisies relues du disque ne se relancent pas seules : le client ne rejoue la file qu'au passage hors ligne → en ligne, et l'app peut démarrer déjà connectée. Sans réseau, elles se remettent simplement en pause.
        void queryClient.resumePausedMutations();
        setRestoredFor(userId);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [userId, isLoading, queryClient]);

  return !isLoading && (userId === null || restoredFor === userId);
}
