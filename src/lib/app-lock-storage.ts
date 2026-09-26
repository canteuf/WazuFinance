import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Réglage du verrouillage, gardé sur le téléphone seulement, dans SecureStore (Keystore Android, trousseau iOS).
 *
 * Par compte (la clé porte l'identifiant) : deux personnes qui se connectent tour à tour sur le même téléphone ont chacune leur code. Le code lui-même n'est jamais stocké, seulement son empreinte salée. Les échecs sont stockés aussi : fermer et rouvrir l'app ne remet pas le compteur à zéro.
 */
export type AppLockSettings = {
  pinHash: string;
  salt: string;
  biometrics: boolean;
  failures: number;
  lastFailureAt: number | null;
};

function storageKey(userId: string): string {
  // SecureStore n'accepte que lettres, chiffres, « . », « - » et « _ » : un UUID convient.
  return `app_lock_${userId}`;
}

function isSettings(value: unknown): value is AppLockSettings {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.pinHash === 'string' &&
    typeof v.salt === 'string' &&
    typeof v.biometrics === 'boolean' &&
    typeof v.failures === 'number' &&
    (v.lastFailureAt === null || typeof v.lastFailureAt === 'number')
  );
}

/** `null` : verrouillage désactivé. Une valeur illisible compte comme désactivée plutôt que d'enfermer l'utilisateur dehors. */
export async function readAppLock(userId: string): Promise<AppLockSettings | null> {
  const raw = await SecureStore.getItemAsync(storageKey(userId));
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSettings(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeAppLock(userId: string, settings: AppLockSettings): Promise<void> {
  await SecureStore.setItemAsync(storageKey(userId), JSON.stringify(settings), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function clearAppLock(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(storageKey(userId));
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export function newSalt(): string {
  return Array.from(getRandomBytes(16), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createAppLock(pin: string, biometrics: boolean): Promise<AppLockSettings> {
  const salt = newSalt();
  return { pinHash: await hashPin(pin, salt), salt, biometrics, failures: 0, lastFailureAt: null };
}
