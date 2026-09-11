import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { SavingsProgress } from '@/lib/savings-progress';
import { formatAmount } from '@/lib/money';
import { font, radius, spacing, stackAtFontScale, useColors } from '@/theme/tokens';

/** Le texte dit ce que la couleur dit : un daltonien lit la même information. */
function statusText(item: SavingsProgress): string {
  if (item.status === 'reached') {
    return 'Atteint';
  }
  const remaining = item.goal.target_amount - item.goal.current_amount;
  return `Il reste ${formatAmount(remaining)} €`;
}

export function SavingsGoalRow({
  item,
  onPress,
}: {
  item: SavingsProgress;
  onPress: () => void;
}) {
  const colors = useColors();
  const { fontScale } = useWindowDimensions();

  const barColor = item.status === 'reached' ? colors.positive : colors.primary;
  const percent = item.percent;

  // Au-delà du seuil, le nom et les montants s'empilent plutôt que de se
  // disputer la largeur — même motif que budget-row.tsx.
  const stacked = fontScale >= stackAtFontScale;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.goal.name}, ${formatAmount(item.goal.current_amount)} euros sur ${formatAmount(item.goal.target_amount)} euros, ${percent} %. ${statusText(item)}`}
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.head, stacked && styles.headStacked]}>
        <Text style={[styles.name, { color: colors.text }]}>{item.goal.name}</Text>
        <Text style={[styles.amounts, { color: colors.textMuted }]}>
          {formatAmount(item.goal.current_amount)} / {formatAmount(item.goal.target_amount)} €
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
        <View
          style={[
            styles.bar,
            {
              // Plafonnée à 100 % de la piste, plancher à 2 % dès qu'il y a
              // quelque chose — même motif que budget-row.tsx.
              width: `${item.goal.current_amount === 0 ? 0 : Math.min(Math.max(percent, 2), 100)}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>

      <Text
        style={[
          styles.status,
          { color: item.status === 'reached' ? colors.positive : colors.textMuted },
        ]}
      >
        {statusText(item)} · {percent} %
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 14,
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  amounts: {
    fontFamily: font.bold,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: radius.pill,
  },
  status: {
    fontFamily: font.medium,
    fontSize: 12.5,
  },
});
