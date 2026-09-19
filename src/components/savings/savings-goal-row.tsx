import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { goalIcon } from '@/components/savings/goal-icons';
import { ProgressBar } from '@/components/ui/progress-bar';
import { formatMonthYear } from '@/lib/dates';
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

/**
 * Carte d'objectif d'après la maquette Stitch `objectifs_d_pargne_wazu_finance` : l'icône et le nom, l'échéance, l'épargné sur la cible, la barre, puis ce qui reste et le rythme mensuel qui y mène.
 *
 * Un objectif atteint passe en carte atténuée, sous les objectifs en cours : il n'appelle plus d'effort.
 */
export function SavingsGoalRow({
  item,
  rhythm,
  onPress,
}: {
  item: SavingsProgress;
  /** Rythme mensuel calculé par savings_plans(). Absent sans échéance, une fois atteint, ou tant que les totaux chargent. */
  rhythm: number | undefined;
  onPress: () => void;
}) {
  const colors = useColors();
  const elevation = useElevation();
  const { fontScale } = useWindowDimensions();
  const { goal, percent } = item;

  const reached = item.status === 'reached';
  const remaining = goal.target_amount - goal.current_amount;
  const stacked = fontScale >= stackAtFontScale;

  const meta = goal.target_date
    ? `Échéance : ${formatMonthYear(goal.target_date)}`
    : 'Sans date limite';

  const footLeft = reached
    ? `${formatAmount(goal.current_amount)} € atteints`
    : `Reste ${formatAmount(remaining)} €`;
  const footRight = reached
    ? null
    : rhythm !== undefined
      ? `Rythme : ${formatAmount(rhythm)} €/mois`
      : goal.target_date
        ? null
        : 'Épargne libre';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${goal.name}, ${formatAmount(goal.current_amount)} euros sur ${formatAmount(goal.target_amount)} euros, ${percent} %. ${meta}. ${footLeft}${footRight ? `. ${footRight}` : ''}. Toucher pour verser ou modifier.`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        reached ? null : elevation.card,
        {
          backgroundColor: reached ? colors.surfaceMuted : colors.surface,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.head}>
        {/* Carré arrondi, comme les postes de dépense : le rond est réservé aux personnes. */}
        <View
          style={[
            styles.glyph,
            { backgroundColor: reached ? colors.surface : colors.surfaceMuted },
          ]}
        >
          <MaterialCommunityIcons
            name={goalIcon(goal.icon)}
            size={22}
            color={reached ? colors.textMuted : colors.primary}
          />
        </View>
        <View style={styles.identity}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
            {goal.name}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>{meta}</Text>
        </View>
        {reached ? (
          <View style={styles.reached}>
            <MaterialCommunityIcons name="check" size={16} color={colors.text} />
            <Text style={[styles.reachedLabel, { color: colors.text }]}>Atteint</Text>
          </View>
        ) : (
          <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.textMuted} />
        )}
      </View>

      <View style={[styles.figures, stacked && styles.figuresStacked]}>
        <View style={styles.amounts}>
          <Text style={[styles.current, { color: colors.text }]}>
            {formatAmount(goal.current_amount)} €
          </Text>
          <Text style={[styles.target, { color: colors.textMuted }]}>
            / {formatAmount(goal.target_amount)} €
          </Text>
        </View>
        <Text style={[styles.percent, { color: reached ? colors.text : colors.primary }]}>
          {percent} %
        </Text>
      </View>

      <ProgressBar
        ratio={goal.current_amount === 0 ? 0 : percent / 100}
        tone={reached ? 'muted' : 'accent'}
        size="lg"
      />

      <View style={[styles.foot, stacked && styles.footStacked]}>
        <Text style={[styles.footText, { color: colors.textMuted }]}>{footLeft}</Text>
        {footRight ? (
          <Text style={[styles.footText, { color: colors.textMuted }]}>{footRight}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm + 4,
    padding: spacing.md + 2,
    borderRadius: radius.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 4,
  },
  glyph: {
    width: 48,
    height: 48,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontFamily: font.bold,
    fontSize: 18,
    letterSpacing: -0.3,
  },
  meta: {
    fontFamily: font.regular,
    fontSize: 13,
  },
  reached: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reachedLabel: {
    fontFamily: font.medium,
    fontSize: 13,
  },
  figures: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  figuresStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  amounts: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    flexShrink: 1,
  },
  current: {
    fontFamily: font.bold,
    fontSize: 22,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  target: {
    fontFamily: font.regular,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  percent: {
    fontFamily: font.bold,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  footStacked: {
    flexDirection: 'column',
    gap: 2,
  },
  footText: {
    fontFamily: font.regular,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
