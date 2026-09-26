import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { reportError } from '@/lib/monitoring';

/**
 * Stockage de la session Supabase dans SecureStore (Keystore Android, trousseau iOS), découpée en morceaux.
 *
 * La session contient le jeton de rafraîchissement, qui ouvre le compte sans mot de passe : écrite en clair dans AsyncStorage, elle se lisait sur un téléphone rooté ou dans une sauvegarde. SecureStore chiffre lui-même avec une clé du Keystore, mais Android refuse ou avertit au-delà d'environ 2 Ko par valeur, et une session les dépasse : elle est donc écrite en morceaux de `CHUNK_SIZE` caractères, plus un compteur.
 *
 * Un premier essai chiffrait la session avec l'AES d'`expo-crypto` et la rangeait dans AsyncStorage. Il a été abandonné : sur Android, `fromCombined` refuse la chaîne base64 que sa documentation annonce, et le déchiffrement rend des octets en trop selon le fournisseur cryptographique, ce qui corrompait la session et déconnectait à chaque lancement. Le découpage n'a aucun calcul maison.
 *
 * Une session écrite en clair par une version précédente est relue une fois, recopiée dans SecureStore, puis effacée : la mise à jour ne déconnecte personne.
 */

/** 2 048 octets maximum par valeur, et un caractère peut en prendre jusqu'à 4 en UTF-8 : 500 caractères tiennent toujours. */
const CHUNK_SIZE = 500;

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/**
 * Valeurs déjà relues, par clé. supabase-js relit la session avant chaque requête : sans ce cache, chaque appel réseau attendait autant de lectures SecureStore que de morceaux.
 */
const memory = new Map<string, string | null>();

// SecureStore n'accepte que lettres, chiffres, « . », « - » et « _ » : la clé de supabase-js (`sb-<ref>-auth-token`) convient telle quelle.
const countKey = (key: string) => `${key}.count`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

function fail(error: unknown, where: string) {
  if (__DEV__) {
    console.warn(`[session] ${where}`, error);
  }
  reportError(error, where);
}

async function readChunks(key: string): Promise<string | null> {
  const count = Number(await SecureStore.getItemAsync(countKey(key), OPTIONS));
  if (!Number.isInteger(count) || count <= 0) {
    return null;
  }
  const parts: string[] = [];
  for (let index = 0; index < count; index++) {
    const part = await SecureStore.getItemAsync(chunkKey(key, index), OPTIONS);
    if (part === null) {
      // Écriture interrompue : une session partielle ne vaut rien.
      return null;
    }
    parts.push(part);
  }
  return parts.join('');
}

async function writeChunks(key: string, value: string): Promise<void> {
  const previous = Number(await SecureStore.getItemAsync(countKey(key), OPTIONS)) || 0;
  const parts: string[] = [];
  for (let start = 0; start < value.length; start += CHUNK_SIZE) {
    parts.push(value.slice(start, start + CHUNK_SIZE));
  }
  for (const [index, part] of parts.entries()) {
    await SecureStore.setItemAsync(chunkKey(key, index), part, OPTIONS);
  }
  // Le compteur en dernier : tant qu'il n'est pas écrit, une lecture voit l'ancienne longueur, jamais un mélange tronqué.
  await SecureStore.setItemAsync(countKey(key), String(parts.length), OPTIONS);
  for (let index = parts.length; index < previous; index++) {
    await SecureStore.deleteItemAsync(chunkKey(key, index), OPTIONS);
  }
}

async function removeChunks(key: string): Promise<void> {
  const count = Number(await SecureStore.getItemAsync(countKey(key), OPTIONS)) || 0;
  await SecureStore.deleteItemAsync(countKey(key), OPTIONS);
  for (let index = 0; index < count; index++) {
    await SecureStore.deleteItemAsync(chunkKey(key, index), OPTIONS);
  }
}

async function readFromDisk(key: string): Promise<string | null> {
  try {
    const stored = await readChunks(key);
    if (stored !== null) {
      return stored;
    }
  } catch (error) {
    // SecureStore illisible (clé du Keystore perdue après une restauration) : on repart sans session.
    fail(error, 'session-read');
    return null;
  }

  // Session en clair laissée par une version précédente : on la recopie dans SecureStore et on efface l'originale.
  const legacy = await AsyncStorage.getItem(key);
  if (legacy === null) {
    return null;
  }
  try {
    await writeChunks(key, legacy);
    await AsyncStorage.removeItem(key);
  } catch (error) {
    // SecureStore indisponible : la session reste en clair plutôt que de déconnecter l'utilisateur, et l'incident remonte au suivi.
    fail(error, 'session-migrate');
  }
  return legacy;
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (memory.has(key)) {
      return memory.get(key) ?? null;
    }
    const value = await readFromDisk(key);
    memory.set(key, value);
    return value;
  },

  async setItem(key: string, value: string): Promise<void> {
    // En mémoire d'abord : la requête suivante n'attend pas l'écriture.
    memory.set(key, value);
    try {
      await writeChunks(key, value);
      await AsyncStorage.removeItem(key);
    } catch (error) {
      fail(error, 'session-write');
      await AsyncStorage.setItem(key, value);
      // Les morceaux précédents, relus en premier au prochain lancement, rendraient une session périmée.
      await removeChunks(key).catch(() => undefined);
    }
  },

  async removeItem(key: string): Promise<void> {
    memory.set(key, null);
    await AsyncStorage.removeItem(key);
    try {
      await removeChunks(key);
    } catch (error) {
      fail(error, 'session-remove');
    }
  },
};
