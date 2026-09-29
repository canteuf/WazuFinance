import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseRejected, withRejected, type RejectedWrite } from '@/lib/rejected-writes';

/**
 * Liste « À corriger », gardée sur le téléphone par compte, et prévenant ceux qui l'affichent quand elle change.
 *
 * Hors du cache TanStack Query : c'est la `MutationCache` qui l'alimente, en dehors de tout composant, et elle doit survivre à un vidage du cache. Une préférence locale comme la dernière catégorie, pas une donnée du serveur.
 */

const listeners = new Set<() => void>();

function key(userId: string): string {
  return `rejected-writes:${userId}`;
}

export function subscribeRejected(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export async function readRejected(userId: string): Promise<RejectedWrite[]> {
  try {
    return parseRejected(await AsyncStorage.getItem(key(userId)));
  } catch {
    return [];
  }
}

export async function addRejected(userId: string, entry: RejectedWrite): Promise<void> {
  try {
    const list = await readRejected(userId);
    await AsyncStorage.setItem(key(userId), JSON.stringify(withRejected(list, entry)));
  } catch {
    // L'alerte a déjà dit ce qui a été refusé ; sans stockage, il ne reste que ce message.
  }
  notify();
}

export async function removeRejected(userId: string, id: string): Promise<void> {
  try {
    const list = await readRejected(userId);
    await AsyncStorage.setItem(key(userId), JSON.stringify(list.filter((item) => item.id !== id)));
  } catch {
    // Préférence locale : un échec laisse simplement la ligne affichée.
  }
  notify();
}
