import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatAmount } from '@/lib/money';
import type { BudgetProgress, BudgetStatus } from '@/lib/budget-progress';
import { categoryTone } from '@/theme/category-colors';
import { font, radius, spacing, useColors, useIsDark } from '@/theme/tokens';

/** Le texte dit ce que la couleur dit : un daltonien lit la même information. */
function statusText(item: BudgetProgress): string {
  if (item.status === 'over') {
    return `Dépassé de ${formatAmount(Math.abs(item.remaining))} €`;
  }
  return `Il reste ${formatAmount(item.remaining)} €`;
}

export function BudgetRow({
  item,
  onPress,
}: {
  item: BudgetProgress;
  onPress: () => void;
}) {
  const colors = useColors();
  const isDark = useIsDark();
  const tone = categoryTone(
    { id: item.budget.category.id, icon: item.budget.category.icon },
    isDark
  );

  const statusColor: Record<BudgetStatus, string> = {
    ok: colors.textMuted,
    warning: colors.warning,
    over: colors.danger,
  };

  // La piste garde la teinte de la catégorie, la barre prend celle du statut :
  // on reconnaît le poste à sa couleur habituelle et on lit l'alerte par-dessus.
  const barColor = item.status === 'ok' ? tone.tint : statusColor[item.status];
  const percent = Math.round(item.ratio * 100);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.budget.category.name}, ${formatAmount(item.spent)} euros sur ${formatAmount(item.budget.amount)}, ${percent} %. ${statusText(item)}`}
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.head}>
        <View style={styles.identity}>
          <View style={[styles.dot, { backgroundColor: tone.surface }]}>
            <MaterialCommunityIcons
              // Le nom vient de la base ; @expo/vector-icons le type strictement.
              name={
                item.budget.category
                  .icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']
              }
              size={16}
              color={tone.tint}
            />
          </View>
          <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
            {item.budget.category.name}
          </Text>
        </View>
        <Text style={[styles.amounts, { color: colors.textMuted }]}>
          {formatAmount(item.spent)} / {formatAmount(item.budget.amount)} €
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: tone.surface }]}>
        <View
          style={[
            styles.bar,
            // Plafonnée à 100 % de la piste, alors que le ratio, lui, reste
            // vrai : une barre qui déborderait de son conteneur ne se lirait
            // plus, mais le pourcentage annoncé doit rester exact.
            { width: `${Math.min(item.ratio * 100, 100)}%`, backgroundColor: barColor },
          ]}
        />
      </View>

      <Text style={[styles.status, { color: statusColor[item.status] }]}>
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
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // Cède au montant plutôt que de le pousser hors de l'écran à fort
    // grossissement de police.
    flexShrink: 1,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
