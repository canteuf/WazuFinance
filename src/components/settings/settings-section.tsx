import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { font, spacing, useColors } from '@/theme/tokens';

/** Une rubrique de l'écran des paramètres : son intitulé en petites capitales, puis sa carte. */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.textMuted }]}>{title}</Text>
      <Card style={styles.card}>{children}</Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  title: {
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
  },
  card: {
    gap: spacing.md,
  },
});
