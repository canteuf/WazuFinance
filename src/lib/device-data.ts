import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearAppLock } from '@/lib/app-lock-storage';

/** Les données lues, gardées pour un démarrage hors ligne (usePersistedQueryCache). */
export function cacheStorageKey(userId: string): string {
  return `query-cache:${userId}`;
}

/** Les saisies pas encore envoyées, sous leur propre clé (usePersistedQueryCache). */
export function queueStorageKey(userId: string): string {
  return `query-queue:${userId}`;
}

/** La liste « À corriger » (rejected-writes-store.ts). */
export function rejectedStorageKey(userId: string): string {
  return `rejected-writes:${userId}`;
}

/** Le dernier groupe choisi (last-used.ts). */
export function lastGroupStorageKey(userId: string): string {
  return `last-group:${userId}`;
}

/**
 * Efface du téléphone tout ce qui est rangé au nom de `userId` : cache, file, « À corriger », dernier groupe, verrou de l'app.
 *
 * Après la suppression d'un compte, ces données ne servent plus à rien — la file ne pourra jamais partir —, et la politique de confidentialité promet qu'elles disparaissent. Elles restaient en clair dans AsyncStorage, montants et notes compris. Ne lève jamais : un échec laisse au pire des données qu'aucun écran ne relira.
 */
export async function forgetAccountOnDevice(userId: string): Promise<void> {
  await Promise.all([
    AsyncStorage.multiRemove([
      cacheStorageKey(userId),
      queueStorageKey(userId),
      rejectedStorageKey(userId),
      lastGroupStorageKey(userId),
    ]).catch(() => undefined),
    clearAppLock(userId).catch(() => undefined),
  ]);
}
