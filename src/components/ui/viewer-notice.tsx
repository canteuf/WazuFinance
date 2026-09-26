import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';

import { font, radius, spacing, useColors } from '@/theme/tokens';

/**
 * Dit à un lecteur pourquoi il ne trouve ni « Ajouter » ni formulaire : sans cette ligne, l'absence des boutons ressemblerait à une panne.
 */
export function ViewerNotice() {
  const colors = useColors();
  return (
    <View
      style={[styles.row, { backgroundColor: colors.surfaceMuted }]}
      accessible
      accessibilityLabel="Vous consultez ce budget en lecteur. Seuls ses membres y saisissent des opérations."
    >
      <MaterialCommunityIcons name="eye-outline" size={18} color={colors.textMuted} />
      <Text style={[styles.label, { color: colors.text }]}>
        Vous consultez ce budget en lecteur. Seuls ses membres y saisissent des opérations.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  label: {
    flexShrink: 1,
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 20,
  },
});
