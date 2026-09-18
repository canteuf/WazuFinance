import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ProgressBar } from '@/components/ui/progress-bar';
import { formatOccurredOn } from '@/lib/dates';
import { formatAmount } from '@/lib/money';
import type { SavingsProgress } from '@/lib/savings-progress';
import {
  font,
  radius,
  spacing,
  stackAtFontScale,
  useColors,
  useElevation,
} from '@/theme/tokens';

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
  const elevation = useElevation();
  const { fontScale } = useWindowDimensions();

  const reached = item.status === 'reached';
  const accent = reached ? colors.positive : colors.primary;
  const percent = item.percent;

  // Au-delà du seuil, le nom et les montants s'empilent plutôt que de se
  // disputer la largeur — même motif que budget-row.tsx.
  const stacked = fontScale >= stackAtFontScale;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.goal.name}, ${formatAmount(item.goal.current_amount)} euros sur ${formatAmount(item.goal.target_amount)} euros, ${percent} %. ${statusText(item)}${item.goal.target_date ? `. Échéance : ${formatOccurredOn(item.goal.target_date)}` : ''}`}
      onPress={onPress}
      // L'élévation remplace le liseré, comme sur les rangées de budget.
      style={[styles.row, elevation.card, { backgroundColor: colors.surface }]}
    >
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: colors.surfaceMuted }]}>
          <MaterialCommunityIcons
            name={reached ? 'check-circle-outline' : 'flag-outline'}
            size={18}
            color={accent}
          />
        </View>
        <View style={styles.identityText}>
          <Text style={[styles.name, { color: colors.text }]}>{item.goal.name}</Text>
          {item.goal.target_date ? (
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              Échéance : {formatOccurredOn(item.goal.target_date)}
            </Text>
          ) : (
            <Text style={[styles.meta, { color: colors.textMuted }]}>Sans échéance</Text>
          )}
        </View>
      </View>

      {/* Le provisionné domine, la cible lui donne son échelle, le
          pourcentage ferme la ligne à droite — l'ordre dans lequel on lit
          « où j'en suis ». */}
      <View style={[styles.figures, stacked && styles.figuresStacked]}>
        <View style={styles.amountsRow}>
          <Text style={[styles.current, { color: reached ? colors.positive : colors.text }]}>
            {formatAmount(item.goal.current_amount)} €
          </Text>
          <Text style={[styles.target, { color: colors.textMuted }]}>
            / {formatAmount(item.goal.target_amount)} €
          </Text>
        </View>
        <Text style={[styles.percent, { color: accent }]}>{percent} %</Text>
      </View>

      <ProgressBar
        ratio={item.goal.current_amount === 0 ? 0 : percent / 100}
        tone={reached ? 'positive' : 'accent'}
        size="lg"
      />

      <Text
        style={[styles.status, { color: reached ? colors.positive : colors.textMuted }]}
      >
        {statusText(item)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  dot: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    gap: 1,
    flexShrink: 1,
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 15,
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  meta: {
    fontFamily: font.regular,
    fontSize: 12,
  },
  figures: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  figuresStacked: {
    // Au-delà du seuil, le pourcentage passe sous les montants plutôt que de
    // les comprimer jusqu'à la troncature.
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  amountsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs + 1,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  current: {
    fontFamily: font.bold,
    fontSize: 20,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  target: {
    fontFamily: font.medium,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  percent: {
    fontFamily: font.bold,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  status: {
    fontFamily: font.medium,
    fontSize: 12.5,
  },
});
