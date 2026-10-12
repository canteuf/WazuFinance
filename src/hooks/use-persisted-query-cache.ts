import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { useQueryClient } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSubscribe,
  removeOldestQuery,
  type PersistedClient,
  type Persister,
  type PersistQueryClientOptions,
  type PersistRetryer,
} from '@tanstack/react-query-persist-client';
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { deserializeCache, serializeCache } from '@/lib/cache-serialization';
import { cacheStorageKey, queueStorageKey } from '@/lib/device-data';
import { reportError } from '@/lib/monitoring';
import {
  capQueries,
  keepQueueAcrossVersions,
  mergeFromDisk,
  prepareForDisk,
  queueOnly,
  rescueExpiredQueue,
  splitForDisk,
} from '@/lib/offline-queue';
import { mutationKeys } from '@/lib/query-keys';

const STORAGE_PREFIX = 'query-cache:';

// La file des saisies pas encore envoyées vit sous queueStorageKey() (splitForDisk). Jamais effacée à la déconnexion : elle repart à la prochaine connexion de son auteur ; seule la suppression du compte l'efface (forgetAccountOnDevice).

/** Taille maximale des données lues écrites sur le disque, en caractères. Au-delà d'environ 2 Mo, une valeur AsyncStorage s'écrit mais ne se relit plus sur Android ; les requêtes les plus anciennes sont retirées avant (capQueries). */
const MAX_DATA_CHARS = 1_500_000;

/**
 * Format du cache écrit, ajouté à la version de l'app dans le `buster`. À incrémenter quand l'écriture change sans nouvelle version de l'app : un cache au format précédent est alors jeté au lieu d'être relu. Passé à 2 quand les `Map` ont cessé d'être écrites comme `{}` (cache-serialization.ts) — les caches déjà écrits les contenaient vides et faisaient planter l'historique et l'épargne.
 */
const CACHE_FORMAT = 2;

/**
 * Âge maximal d'un cache relu au démarrage. Trente jours et non une semaine : le cache porte aussi les saisies restées en file, et un téléphone laissé une semaine sans réseau ni ouverture les aurait perdues avec lui. Les données affichées, elles, sont rechargées dès que le réseau revient — leur âge ne compte que hors ligne. Doit rester égal au `gcTime` du provider, sinon une requête sortie du cache mémoire disparaît aussi du disque.
 */
export const PERSISTED_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const storageKey = cacheStorageKey;
const queueKey = queueStorageKey;

/** Les données lues, écrites sous MAX_DATA_CHARS. Appelée par le persister de la bibliothèque, donc au plus une fois par seconde. */
function serializeCapped(client: PersistedClient): string {
  const serialized = serializeCache(client);
  if (serialized.length <= MAX_DATA_CHARS) {
    return serialized;
  }
  return serializeCache(capQueries(client, MAX_DATA_CHARS, (query) => serializeCache(query).length));
}

/**
 * Réduit les caches écrits pour d'autres utilisateurs que `keep` à leurs seules saisies en file. Les données lues ne survivent pas à la déconnexion : c'est la même frontière que le vidage en mémoire, étendue au disque, pour qu'un téléphone prêté ou revendu ne garde pas les comptes de quelqu'un d'autre. Balayer par préfixe rattrape aussi une déconnexion interrompue avant la fin.
 *
 * Les saisies pas encore envoyées, elles, restent : une déconnexion — volontaire, « Code oublié », ou dix codes faux — les effaçait en silence, alors qu'elles ne sont nulle part ailleurs. Elles partent à la prochaine connexion du même compte sur ce téléphone. Un cache sans saisie en file est effacé entièrement, comme avant.
 */
async function discardOtherCaches(keep: string | null): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const others = keys.filter(
      (key) => key.startsWith(STORAGE_PREFIX) && (keep === null || key !== storageKey(keep))
    );
    for (const key of others) {
      const raw = await AsyncStorage.getItem(key);
      let remaining: PersistedClient | null = null;
      try {
        remaining = raw === null ? null : queueOnly(deserializeCache<PersistedClient>(raw));
      } catch {
        // Illisible : rien à sauver.
      }
      if (remaining === null) {
        await AsyncStorage.removeItem(key);
        continue;
      }
      // Déjà réduit lors d'un balayage précédent : rien à réécrire.
      const stripped = serializeCache(remaining);
      if (stripped !== raw) {
        await AsyncStorage.setItem(key, stripped);
      }
    }
  } catch {
    // Un balayage manqué sera refait au prochain changement de session ; il ne bloque rien.
  }
}

/**
 * Écriture sur le disque refusée (stockage plein, limite d'AsyncStorage) : on retire la donnée lue la plus ancienne et on réessaie, jusqu'à ce que ça passe. Les saisies en file ne sont jamais retirées : `removeOldestQuery` ne touche qu'aux requêtes.
 *
 * Sans cette stratégie, la bibliothèque avalait l'échec en silence : la saisie n'existait plus qu'en mémoire, et un arrêt de l'app par Android la faisait disparaître. Quand il n'y a plus rien à retirer, l'échec est signalé à Sentry.
 */
const retryWrite: PersistRetryer = (props) => {
  const smaller = removeOldestQuery(props);
  if (!smaller) {
    reportError(props.error, 'query-cache-write');
  }
  return smaller;
};

/**
 * Le persister de la bibliothèque, entouré de transformations (`offline-queue.ts`) : à l'écriture, les saisies en cours d'envoi passent sur le disque comme des pauses, les historiques n'y gardent que leurs premières pages, et la file est écrite à part, sous sa propre clé ; à la relecture, un cache écrit par une autre version de l'app garde ses saisies en file et perd seulement ses données lues.
 *
 * La file est écrite à chaque changement, sans attendre : elle est petite, et c'est elle qu'un arrêt de l'app ne doit pas perdre. Elle n'est réécrite que si elle a changé. Les données lues passent par le persister de la bibliothèque, qui les écrit au plus une fois par seconde, plafonnées.
 */
function createPersister(userId: string, buster: string): Persister {
  const base = createAsyncStoragePersister({
    storage: AsyncStorage,
    key: storageKey(userId),
    serialize: serializeCapped,
    deserialize: deserializeCache,
    retry: retryWrite,
  });
  // La file telle qu'elle est sur le disque ; undefined tant qu'on ne le sait pas.
  let writtenQueue: string | null | undefined;

  async function writeQueue(queue: PersistedClient): Promise<void> {
    const serialized = queue.clientState.mutations.length > 0 ? serializeCache(queue) : null;
    if (serialized === writtenQueue) {
      return;
    }
    writtenQueue = serialized;
    try {
      if (serialized === null) {
        await AsyncStorage.removeItem(queueKey(userId));
      } else {
        await AsyncStorage.setItem(queueKey(userId), serialized);
      }
    } catch (error) {
      writtenQueue = undefined;
      reportError(error, 'query-queue-write');
    }
  }

  return {
    persistClient: async (client) => {
      const { queue, data } = splitForDisk(prepareForDisk(client));
      await writeQueue(queue);
      return base.persistClient(data);
    },
    restoreClient: async () => {
      let data: PersistedClient | undefined;
      try {
        data = await base.restoreClient();
      } catch (error) {
        // Données illisibles : on les efface et on repart de la file seule, qui vit sous sa propre clé.
        reportError(error, 'query-cache-read');
        await AsyncStorage.removeItem(storageKey(userId)).catch(() => undefined);
      }
      let queue: PersistedClient | undefined;
      try {
        const raw = await AsyncStorage.getItem(queueKey(userId));
        queue = raw === null ? undefined : deserializeCache<PersistedClient>(raw);
        writtenQueue = raw;
      } catch (error) {
        reportError(error, 'query-queue-read');
      }
      const client = mergeFromDisk(data, queue);
      return client
        ? keepQueueAcrossVersions(rescueExpiredQueue(client, Date.now(), PERSISTED_CACHE_MAX_AGE), buster)
        : client;
    },
    // La bibliothèque efface le cache qu'elle juge trop vieux ou d'une autre version : seulement les données lues. La file, que restoreClient a déjà sauvée de ces deux cas, reste.
    removeClient: () => base.removeClient(),
  };
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
    // Une nouvelle version de l'app peut changer la forme des données en cache : les données lues d'un cache d'une autre version sont jetées plutôt que relues dans un format qu'aucun écran n'attend plus. Les saisies en file, elles, sont gardées (createPersister) : une mise à jour installée depuis le Play Store, un APK ou EAS Update pendant qu'elles attendaient le réseau ne doit pas les perdre.
    const buster = `${Constants.expoConfig?.version ?? ''}#${CACHE_FORMAT}`;
    const options: PersistQueryClientOptions = {
      queryClient,
      persister: createPersister(userId, buster),
      maxAge: PERSISTED_CACHE_MAX_AGE,
      buster,
      dehydrateOptions: {
        // Seules les écritures sur les opérations ont une fonction enregistrée sous leur clé (registerTransactionMutationDefaults) : toute autre écriture relue au démarrage ne saurait pas quoi exécuter. En pause ou en cours d'envoi : une saisie qui partait quand Android a tué l'app doit être sur le disque, sinon elle est perdue (prepareForDisk la relance au démarrage).
        shouldDehydrateMutation: (mutation) =>
          mutation.state.status === 'pending' &&
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
