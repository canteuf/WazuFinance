import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { useEffect, useEffectEvent, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PinPad } from '@/components/lock/pin-pad';
import { useAppLock } from '@/hooks/use-app-lock';
import { formatWait, lockoutRemainingMs, MAX_FAILURES, PIN_LENGTH } from '@/lib/app-lock';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Écran de verrouillage, affiché par `AppLockProvider` dans une `Modal`.
 *
 * L'empreinte est proposée d'elle-même à l'ouverture quand elle est activée ; l'annuler laisse le pavé, et la touche empreinte la relance.
 */
export function LockScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, checkPin, unlock, unlockWithBiometrics, forget } = useAppLock();
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const failures = settings?.failures ?? 0;
  const waitMs = lockoutRemainingMs(failures, settings?.lastFailureAt ?? null, now);
  const biometrics = settings?.biometrics === true;

  // Compte à rebours de l'attente imposée : un rendu par seconde, seulement pendant qu'elle court.
  useEffect(() => {
    if (waitMs <= 0) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waitMs]);

  // Proposée une fois à l'ouverture ; `settings` est déjà lu quand l'écran s'affiche.
  const promptOnOpen = useEffectEvent(() => {
    if (biometrics) {
      void unlockWithBiometrics().catch(() => false);
    }
  });
  useEffect(() => {
    promptOnOpen();
  }, []);

  async function handleChange(next: string) {
    setWrong(false);
    setPin(next);
    if (next.length < PIN_LENGTH) {
      return;
    }
    setBusy(true);
    try {
      const result = await checkPin(next);
      if (result.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        unlock();
        return;
      }
      if (result.signedOut) {
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setWrong(true);
      setPin('');
      setNow(Date.now());
    } finally {
      setBusy(false);
    }
  }

  function confirmForget() {
    Alert.alert(
      'Code oublié ?',
      // Les saisies en file ne sont pas perdues (usePersistedQueryCache) : le dire, sinon l'utilisateur hésiterait à se déconnecter pour rien.
      'Vous allez être déconnecté de ce téléphone. Reconnectez-vous avec votre mot de passe : vos données sont intactes, les opérations pas encore envoyées partiront à la reconnexion, et vous pourrez choisir un nouveau code dans les Paramètres.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se déconnecter', style: 'destructive', onPress: () => void forget() },
      ]
    );
  }

  const remaining = MAX_FAILURES - failures;
  let message = 'Saisissez votre code';
  if (waitMs > 0) {
    message = `Trop d’essais. Réessayez dans ${formatWait(waitMs)}.`;
  } else if (wrong && failures >= 5) {
    message = `Code incorrect. Encore ${remaining} essai${remaining > 1 ? 's' : ''} avant la déconnexion.`;
  } else if (wrong) {
    message = 'Code incorrect.';
  }

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg },
      ]}
    >
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: colors.surface }]}>
          <MaterialCommunityIcons name="lock-outline" size={30} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          Wazu Finance
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.message, { color: wrong || waitMs > 0 ? colors.danger : colors.textMuted }]}
        >
          {message}
        </Text>
      </View>

      <PinPad
        value={pin}
        onChange={(next) => void handleChange(next)}
        disabled={busy || waitMs > 0}
        onBiometric={biometrics ? () => void unlockWithBiometrics().catch(() => false) : undefined}
      />

      <Pressable accessibilityRole="button" onPress={confirmForget} hitSlop={spacing.sm} style={styles.forgot}>
        <Text style={[styles.forgotText, { color: colors.primary }]}>Code oublié ?</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  head: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: font.black,
    fontSize: 26,
    letterSpacing: -0.6,
  },
  message: {
    fontFamily: font.medium,
    fontSize: 16,
    textAlign: 'center',
    minHeight: 44,
  },
  forgot: {
    minHeight: 44,
    justifyContent: 'center',
  },
  forgotText: {
    fontFamily: font.semibold,
    fontSize: 16,
  },
});
