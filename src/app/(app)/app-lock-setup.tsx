import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { PinPad } from '@/components/lock/pin-pad';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useAppLock } from '@/hooks/use-app-lock';
import { useToast } from '@/hooks/use-toast';
import { formatWait, isGuessablePin, PIN_LENGTH } from '@/lib/app-lock';
import { goBackOr } from '@/lib/navigation';
import { font, useColors } from '@/theme/tokens';

type Mode = 'create' | 'change' | 'disable';
type Step = 'current' | 'new' | 'confirm';

const PROMPTS: Record<Step, string> = {
  current: 'Saisissez votre code actuel',
  new: 'Choisissez un code à 4 chiffres',
  confirm: 'Saisissez-le une seconde fois',
};

/**
 * Création, changement ou désactivation du code de verrouillage.
 *
 * Changer ou désactiver redemande le code actuel, avec la même limite d'essais que l'écran de verrouillage : sans elle, ce formulaire servirait à deviner le code d'un téléphone laissé ouvert.
 */
export default function AppLockSetupScreen() {
  const colors = useColors();
  const router = useRouter();
  const toast = useToast();
  const { mode: rawMode } = useLocalSearchParams<{ mode?: string }>();
  const { settings, checkPin, enable, changePin, disable, biometricsAvailable } = useAppLock();
  // Le mode suit l'état réel, pas le paramètre : `wazufinance://app-lock-setup` sans paramètre ouvrait la création alors qu'un code existait, et remplaçait ce code sans demander l'actuel. Figé à l'ouverture : après `enable()`, `settings` n'est plus null, et la création ne doit pas se changer en changement sous les doigts. L'écran ne s'affiche jamais pendant la lecture du réglage (`settings === undefined`), que couvre le voile d'AppLockProvider.
  const [mode] = useState<Mode>(() =>
    settings ? (rawMode === 'disable' ? 'disable' : 'change') : 'create'
  );

  const [step, setStep] = useState<Step>(mode === 'create' ? 'new' : 'current');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function close() {
    goBackOr(router, '/settings');
  }

  function fail(message: string) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setError(message);
    setPin('');
  }

  async function complete(value: string) {
    if (step === 'current') {
      const result = await checkPin(value);
      if (!result.ok) {
        if (result.signedOut) {
          return;
        }
        fail(result.waitMs > 0 ? `Code incorrect. Réessayez dans ${formatWait(result.waitMs)}.` : 'Code incorrect.');
        return;
      }
      if (mode === 'disable') {
        await disable();
        toast.show('Verrouillage désactivé');
        close();
        return;
      }
      setPin('');
      setStep('new');
      return;
    }

    if (step === 'new') {
      if (isGuessablePin(value)) {
        fail('Trop facile à deviner : évitez les suites et les chiffres répétés.');
        return;
      }
      setFirstPin(value);
      setPin('');
      setStep('confirm');
      return;
    }

    if (value !== firstPin) {
      setFirstPin('');
      setStep('new');
      fail('Les deux codes ne correspondent pas. Recommencez.');
      return;
    }
    if (mode === 'create') {
      await enable(value);
      toast.show(biometricsAvailable ? 'Verrouillage activé, avec l’empreinte' : 'Verrouillage activé');
    } else {
      await changePin(value);
      toast.show('Code modifié');
    }
    close();
  }

  async function handleChange(next: string) {
    setError(undefined);
    setPin(next);
    if (next.length < PIN_LENGTH) {
      return;
    }
    setBusy(true);
    try {
      await complete(next);
    } catch {
      fail('Le code n’a pas pu être enregistré sur ce téléphone. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === 'create' ? 'Verrouiller l’app' : mode === 'change' ? 'Changer le code' : 'Désactiver le verrouillage';

  return (
    <Screen header={<ScreenHeader title={title} onBack={close} />}>
      <Text style={[styles.prompt, { color: colors.text }]} accessibilityRole="header">
        {PROMPTS[step]}
      </Text>
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.hint, { color: error ? colors.danger : colors.textMuted }]}
      >
        {error ??
          (step === 'new'
            ? 'Il sera demandé à l’ouverture de l’app et après une minute passée ailleurs.'
            : ' ')}
      </Text>
      <PinPad value={pin} onChange={(next) => void handleChange(next)} disabled={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  prompt: {
    fontFamily: font.bold,
    fontSize: 22,
    textAlign: 'center',
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    minHeight: 44,
  },
});
