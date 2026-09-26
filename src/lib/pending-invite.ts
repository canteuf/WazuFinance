import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Le code d'un lien d'invitation touché, en attendant de pouvoir ouvrir « Rejoindre ».
 *
 * Le lien peut arriver avant toute session — l'invité installe l'app, puis s'inscrit — ou pendant que l'app est verrouillée. Il est donc gardé sur le téléphone, et `usePendingInvite()` ouvre l'écran dès qu'un compte est connecté. Une heure au plus : un lien touché la semaine dernière ne doit pas ouvrir un écran sans prévenir.
 */

const KEY = 'pending-invite';
const MAX_AGE_MS = 60 * 60 * 1000;

type Listener = () => void;
const listeners = new Set<Listener>();

export async function setPendingInvite(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // Sans stockage, le lien est perdu : l'invité saisira le code à la main, qui figure dans le message.
  }
  listeners.forEach((listener) => listener());
}

/** Le code en attente, retiré du stockage : il n'ouvre l'écran qu'une fois. */
export async function takePendingInvite(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) {
      return null;
    }
    await AsyncStorage.removeItem(KEY);
    const { code, at } = JSON.parse(raw) as { code?: unknown; at?: unknown };
    if (typeof code !== 'string' || typeof at !== 'number' || Date.now() - at > MAX_AGE_MS) {
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

export function subscribePendingInvite(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
