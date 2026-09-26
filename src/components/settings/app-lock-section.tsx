import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text } from 'react-native';

import {
  SettingsDivider,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-section';
import { useAppLock } from '@/hooks/use-app-lock';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Verrouillage de l'app : l'activer, choisir l'empreinte, changer ou retirer le code.
 *
 * Réglage de ce téléphone seulement : il n'est pas synchronisé, et un autre appareil connecté au même compte garde le sien.
 */
export function AppLockSection() {
  const colors = useColors();
  const router = useRouter();
  const { settings, biometricsAvailable, setBiometrics } = useAppLock();
  const [biometricsError, setBiometricsError] = useState<string>();

  if (settings === undefined) {
    return null;
  }

  return (
    <SettingsSection title="Verrouillage de l’app" flush>
      {settings === null ? (
        <SettingsRow
          icon="lock-outline"
          label="Verrouiller par un code"
          subtitle={`Code à 4 chiffres${biometricsAvailable ? ', ou votre empreinte' : ''}, demandé à l’ouverture et après une minute ailleurs`}
          onPress={() => router.push('/app-lock-setup?mode=create')}
        />
      ) : (
        <>
          {biometricsAvailable ? (
            <>
              <SettingsRow
                icon="fingerprint"
                label="Empreinte ou visage"
                subtitle="Déverrouiller sans taper le code"
                trailing={
                  <Switch
                    accessibilityLabel="Déverrouiller avec l’empreinte ou le visage"
                    value={settings.biometrics}
                    trackColor={{ true: colors.primary }}
                    onValueChange={(on) => {
                      setBiometricsError(undefined);
                      setBiometrics(on)
                        .then((done) => {
                          if (!done && on) {
                            setBiometricsError('Empreinte non confirmée : le code reste seul demandé.');
                          }
                        })
                        .catch(() => setBiometricsError('Réglage non enregistré. Réessayez.'));
                    }}
                  />
                }
              />
              {biometricsError ? (
                <Text style={[styles.error, { color: colors.danger }]}>{biometricsError}</Text>
              ) : null}
              <SettingsDivider />
            </>
          ) : null}
          <SettingsRow
            icon="form-textbox-password"
            label="Changer le code"
            subtitle="Le code actuel sera demandé"
            onPress={() => router.push('/app-lock-setup?mode=change')}
          />
          <SettingsDivider />
          <SettingsRow
            icon="lock-open-variant-outline"
            label="Désactiver le verrouillage"
            subtitle="L’app s’ouvrira sans code sur ce téléphone"
            onPress={() => router.push('/app-lock-setup?mode=disable')}
          />
        </>
      )}
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  error: {
    fontFamily: font.medium,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
});
