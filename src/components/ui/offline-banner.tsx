import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useIsOnline, usePendingWrites } from '@/hooks/use-offline-status';
import { font, spacing, useColors } from '@/theme/tokens';

function writes(count: number): string {
  return count === 1 ? '1 opération' : `${count} opérations`;
}

/**
 * Bandeau d'état de la connexion, au-dessus de tous les écrans de l'app, visible seulement quand il a quelque chose à dire.
 *
 * Hors ligne, les chiffres affichés sont ceux du dernier chargement et une saisie n'apparaît qu'après son envoi : sans ce bandeau, une dépense tout juste enregistrée semblerait perdue. Il dit donc les deux choses qui manquent à l'écran — que les données peuvent dater, et combien d'écritures attendent.
 *
 * Il porte lui-même la zone sûre du haut ; la `SafeAreaView` de chaque écran, placée sous lui, ne la recompte pas, puisqu'elle ne mesure que la part de la zone sûre qu'elle recouvre.
 */
export function OfflineBanner() {
  const colors = useColors();
  const online = useIsOnline();
  const pending = usePendingWrites();

  if (online && pending === 0) {
    return null;
  }

  const message = online
    ? `Envoi de ${writes(pending)}…`
    : pending > 0
      ? `Hors ligne · ${writes(pending)} en attente d’envoi`
      : 'Hors ligne · chiffres du dernier chargement';

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.surfaceMuted }}>
      <View
        style={styles.row}
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={message}
      >
        <MaterialCommunityIcons
          name={online ? 'cloud-upload-outline' : 'cloud-off-outline'}
          size={16}
          color={colors.textMuted}
        />
        <Text style={[styles.label, { color: colors.text }]}>{message}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  label: {
    fontFamily: font.medium,
    fontSize: 14,
    flexShrink: 1,
    textAlign: 'center',
  },
});
