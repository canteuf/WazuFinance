import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { useCommerceSummary } from '@/hooks/use-commerce-summary';
import { formatBalance, formatMoney, spokenAmount, withCurrency } from '@/lib/money';
import { font, spacing, stackAtFontScale, useColors } from '@/theme/tokens';

/**
 * Commerce de la période sur la Synthèse : ventes, achats de stock, et ce qu'il en reste.
 *
 * La commerçante mêle la caisse de la boutique et celle de la maison ; le solde du mois ne lui dit pas si le commerce a gagné de l'argent. Les trois montants viennent de commerce_summary(), sommés en base, sur les bornes de la période comme le reste de l'écran.
 *
 * Aucun réglage : la carte n'apparaît que si la période contient une opération « Commerce » ou « Achat de stock ». Un ménage sans commerce ne la voit jamais.
 */
export function CommerceEntry() {
  const colors = useColors();
  const { fontScale } = useWindowDimensions();
  const summary = useCommerceSummary();
  const stacked = fontScale >= stackAtFontScale;

  if (!summary || summary.count === 0) {
    return null;
  }

  const gained = summary.margin >= 0;

  return (
    <Card>
      <View
        accessible
        accessibilityLabel={`Commerce ce mois-ci. Ventes ${spokenAmount(summary.sales)}, achats de stock ${spokenAmount(summary.stock)}, ${gained ? 'reste' : 'manque'} ${spokenAmount(Math.abs(summary.margin))}.`}
      >
        <View style={styles.cardHead}>
          <MaterialCommunityIcons name="storefront-outline" size={18} color={colors.primary} />
          <Text style={[styles.heading, { color: colors.text }]}>Commerce ce mois</Text>
        </View>

        <View style={[styles.split, stacked && styles.splitStacked]}>
          <View style={styles.stat}>
            <Text style={[styles.statKey, { color: colors.textMuted }]}>Ventes</Text>
            <Text style={[styles.statValue, { color: colors.positive }]}>{formatMoney(summary.sales)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statKey, { color: colors.textMuted }]}>Stock</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{formatMoney(summary.stock)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statKey, { color: colors.textMuted }]}>Ventes − stock</Text>
            <Text style={[styles.statValue, { color: gained ? colors.positive : colors.danger }]}>
              {withCurrency(formatBalance(summary.margin))}
            </Text>
          </View>
        </View>

        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Revenus « Commerce », versements des ventes à crédit compris, moins les « Achat de stock ».
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  heading: {
    fontFamily: font.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  split: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  splitStacked: {
    flexDirection: 'column',
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statKey: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
  statValue: {
    fontFamily: font.semibold,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.md,
  },
});
