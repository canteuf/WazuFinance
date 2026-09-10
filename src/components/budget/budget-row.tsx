import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { formatAmount } from '@/lib/money';
import type { BudgetProgress, BudgetStatus } from '@/lib/budget-progress';
import { categoryTone } from '@/theme/category-colors';
import { font, radius, spacing, stackAtFontScale, useColors, useIsDark } from '@/theme/tokens';

/** Le texte dit ce que la couleur dit : un daltonien lit la même information. */
function statusText(item: BudgetProgress): string {
  if (item.status === 'over') {
    // À exactement 100 %, rien n'est dépassé : « Dépassé de 0,00 € » disait
    // faux. Le statut reste `over` — le budget est épuisé, la prochaine
    // dépense le dépassera —, seul le texte change.
    if (item.remaining === 0) {
      return 'Plafond atteint';
    }
    return `Dépassé de ${formatAmount(Math.abs(item.remaining))} €`;
  }
  if (item.status === 'warning') {
    return `Proche de la limite, il reste ${formatAmount(item.remaining)} €`;
  }
  return `Il reste ${formatAmount(item.remaining)} €`;
}

/** Repli quand RLS masque la catégorie jointe (voir BudgetWithCategory). */
const UNKNOWN_CATEGORY_NAME = 'Catégorie inconnue';

export function BudgetRow({
  item,
  onPress,
}: {
  item: BudgetProgress;
  onPress: () => void;
}) {
  const colors = useColors();
  const isDark = useIsDark();
  const { fontScale } = useWindowDimensions();
  const category = item.budget.category;

  // `category` peut être `null` : RLS masque la ligne jointe quand le budget
  // pointe une catégorie hors de portée du groupe. On retombe sur un libellé
  // et une teinte neutres plutôt que de planter sur des champs manquants.
  const tone = category
    ? categoryTone({ id: category.id, icon: category.icon }, isDark)
    : { tint: colors.textMuted, surface: colors.surfaceMuted };
  const categoryName = category?.name ?? UNKNOWN_CATEGORY_NAME;

  const statusColor: Record<BudgetStatus, string> = {
    ok: colors.textMuted,
    warning: colors.warning,
    over: colors.danger,
  };

  // La piste garde la teinte de la catégorie, la barre prend celle du statut :
  // on reconnaît le poste à sa couleur habituelle et on lit l'alerte par-dessus.
  const barColor = item.status === 'ok' ? tone.tint : statusColor[item.status];
  const percent = Math.round(item.ratio * 100);

  // Au-delà du seuil, le nom et les montants s'empilent plutôt que de se
  // disputer la largeur — même motif que budgets-entry.tsx.
  const stacked = fontScale >= stackAtFontScale;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${categoryName}, ${formatAmount(item.spent)} euros sur ${formatAmount(item.budget.amount)} euros, ${percent} %. ${statusText(item)}`}
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.head, stacked && styles.headStacked]}>
        <View style={styles.identity}>
          <View style={[styles.dot, { backgroundColor: tone.surface }]}>
            <MaterialCommunityIcons
              // Le nom vient de la base ; @expo/vector-icons le type strictement.
              name={
                (category?.icon ?? 'help-circle-outline') as React.ComponentProps<
                  typeof MaterialCommunityIcons
                >['name']
              }
              size={16}
              color={tone.tint}
            />
          </View>
          <Text style={[styles.name, { color: colors.text }]}>{categoryName}</Text>
        </View>
        <Text style={[styles.amounts, { color: colors.textMuted }]}>
          {formatAmount(item.spent)} / {formatAmount(item.budget.amount)} €
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: tone.surface }]}>
        <View
          style={[
            styles.bar,
            // Plafonnée à 100 % de la piste et plancher à 2 % : le ratio, lui,
            // reste vrai — une barre qui déborderait de son conteneur ne se
            // lirait plus, et une part infime resterait un trait invisible
            // qu'on prend pour un bug (même motif que category-breakdown.tsx).
            // Le plancher ne vaut que si quelque chose a été dépensé : une
            // part de la répartition est toujours positive, un budget peut
            // être à zéro, et un filet de barre y ferait croire à une dépense.
            {
              width: `${item.spent === 0 ? 0 : Math.min(Math.max(item.ratio * 100, 2), 100)}%`,
              backgroundColor: barColor,
            },
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
  headStacked: {
    // Le nom et les montants cèdent chacun leur propre ligne au lieu de se
    // rétrécir l'un l'autre.
    flexDirection: 'column',
    alignItems: 'flex-start',
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
