import * as LocalAuthentication from 'expo-local-authentication';
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Modal, StyleSheet, View } from 'react-native';

import { LockScreen } from '@/components/lock/lock-screen';
import { useAuth } from '@/hooks/use-auth';
import { AppLockContext, type AppLockApi } from '@/providers/app-lock-context';
import {
  lockoutDelayMs,
  lockoutRemainingMs,
  MAX_FAILURES,
  shouldLockOnReturn,
} from '@/lib/app-lock';
import {
  clearAppLock,
  createAppLock,
  hashPin,
  readAppLock,
  writeAppLock,
  type AppLockSettings,
} from '@/lib/app-lock-storage';
import { reportError } from '@/lib/monitoring';
import { useColors } from '@/theme/tokens';


/**
 * Verrouillage de l'app par code à 4 chiffres, et empreinte ou visage en option.
 *
 * Désactivé par défaut, activé depuis les Paramètres. Actif, il couvre l'app au démarrage et au retour après une minute hors de l'app (`LOCK_AFTER_MS`). L'écran de verrouillage est une `Modal` et non une vue par-dessus la pile : une feuille de saisie ouverte (formSheet) est présentée au-dessus de la pile, et serait restée visible par-dessus une simple vue.
 *
 * Monté sous la garde de session : sans compte connecté, il n'y a rien à verrouiller.
 */
export function AppLockProvider({ children }: { children: ReactNode }) {
  const colors = useColors();
  const { session, signOut } = useAuth();
  const userId = session?.user.id ?? null;

  const [settings, setSettings] = useState<AppLockSettings | null | undefined>(undefined);
  const [locked, setLocked] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let active = true;
    readAppLock(userId)
      .catch((error: unknown) => {
        // SecureStore illisible : on ne verrouille pas plutôt que d'enfermer l'utilisateur dehors.
        reportError(error, 'app-lock-read');
        return null;
      })
      .then((stored) => {
        if (active) {
          setSettings(stored);
          // Démarrage à froid : verrouillé d'emblée.
          setLocked(stored !== null);
        }
      });
    Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
      .then(([hardware, enrolled]) => {
        if (active) {
          setBiometricsAvailable(hardware && enrolled);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  const onAppStateChange = useEffectEvent((state: string) => {
    // `inactive` (iOS : centre de contrôle, invite biométrique) ne compte pas comme un départ.
    if (state === 'background') {
      backgroundAt.current = Date.now();
    } else if (state === 'active') {
      if (settings && shouldLockOnReturn(backgroundAt.current, Date.now())) {
        setLocked(true);
      }
      backgroundAt.current = null;
    }
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  const api = useMemo<AppLockApi>(() => {
    async function save(next: AppLockSettings | null) {
      if (!userId) {
        return;
      }
      if (next) {
        await writeAppLock(userId, next);
      } else {
        await clearAppLock(userId);
      }
      setSettings(next);
    }

    async function forget() {
      await save(null);
      setLocked(false);
      await signOut({ local: true });
    }

    return {
      settings,
      locked,
      biometricsAvailable,
      async checkPin(pin) {
        if (!settings) {
          return { ok: true };
        }
        const now = Date.now();
        const wait = lockoutRemainingMs(settings.failures, settings.lastFailureAt, now);
        if (wait > 0) {
          return { ok: false, waitMs: wait, signedOut: false };
        }
        if ((await hashPin(pin, settings.salt)) === settings.pinHash) {
          if (settings.failures > 0) {
            await save({ ...settings, failures: 0, lastFailureAt: null });
          }
          return { ok: true };
        }
        const failures = settings.failures + 1;
        if (failures >= MAX_FAILURES) {
          await forget();
          return { ok: false, waitMs: 0, signedOut: true };
        }
        await save({ ...settings, failures, lastFailureAt: now });
        return { ok: false, waitMs: lockoutDelayMs(failures), signedOut: false };
      },
      unlock() {
        setLocked(false);
      },
      async unlockWithBiometrics() {
        if (!settings?.biometrics) {
          return false;
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Déverrouiller Wazu Finance',
          cancelLabel: 'Utiliser le code',
          // Pas de repli sur le code du téléphone : l'app a le sien.
          disableDeviceFallback: true,
        });
        if (!result.success) {
          return false;
        }
        if (settings.failures > 0) {
          await save({ ...settings, failures: 0, lastFailureAt: null });
        }
        setLocked(false);
        return true;
      },
      async enable(pin) {
        await save(await createAppLock(pin, biometricsAvailable));
      },
      async changePin(pin) {
        const fresh = await createAppLock(pin, settings?.biometrics ?? biometricsAvailable);
        await save(fresh);
      },
      async disable() {
        await save(null);
        setLocked(false);
      },
      async setBiometrics(on) {
        if (!settings) {
          return false;
        }
        if (on) {
          // Activer demande une empreinte réussie : on vérifie qu'elle fonctionne avant de s'y fier.
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Confirmer votre empreinte',
            cancelLabel: 'Annuler',
            disableDeviceFallback: true,
          });
          if (!result.success) {
            return false;
          }
        }
        await save({ ...settings, biometrics: on });
        return true;
      },
      forget,
    };
  }, [settings, locked, biometricsAvailable, userId, signOut]);

  // Pendant la lecture du réglage, un écran uni : sans lui, les chiffres s'afficheraient un instant avant que le verrou ne les couvre.
  const covering = settings === undefined || locked;

  return (
    <AppLockContext.Provider value={api}>
      {children}
      <Modal
        visible={covering}
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        // Retour Android : le verrou ne se ferme pas ainsi.
        onRequestClose={() => undefined}
      >
        {locked ? <LockScreen /> : <View style={[styles.blank, { backgroundColor: colors.background }]} />}
      </Modal>
    </AppLockContext.Provider>
  );
}

const styles = StyleSheet.create({
  blank: {
    flex: 1,
  },
});
