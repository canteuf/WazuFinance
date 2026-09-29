import { Linking, StyleSheet, Text } from 'react-native';

import {
  SettingsDivider,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-section';
import { useExportMyData } from '@/hooks/use-export-my-data';
import { dataErrorMessage } from '@/lib/data-errors';
import { LEGAL_URLS } from '@/lib/legal';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Ses données et les textes qui les encadrent : l'export complet (droit d'accès et portabilité), les conditions d'utilisation et la politique de confidentialité, que la politique promet de rendre accessibles depuis l'app.
 */
export function DataSection() {
  const colors = useColors();
  const exportData = useExportMyData();

  return (
    <SettingsSection title="Mes données" flush>
      <SettingsRow
        icon="download-outline"
        label={exportData.isPending ? 'Préparation du fichier…' : 'Télécharger mes données'}
        subtitle="Tout ce que vous avez saisi, en un fichier à garder ou à transmettre"
        onPress={exportData.isPending ? undefined : () => exportData.mutate()}
      />
      {exportData.error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>
          {dataErrorMessage(exportData.error)}
        </Text>
      ) : null}
      <SettingsDivider />
      <SettingsRow
        icon="file-document-outline"
        label="Conditions d’utilisation"
        onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
        accessibilityLabel="Conditions d’utilisation, s’ouvre dans le navigateur"
      />
      <SettingsDivider />
      <SettingsRow
        icon="shield-lock-outline"
        label="Politique de confidentialité"
        onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
        accessibilityLabel="Politique de confidentialité, s’ouvre dans le navigateur"
      />
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  error: {
    fontFamily: font.medium,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
});
