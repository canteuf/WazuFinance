import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { useDebtTotals } from '@/hooks/use-debts';
import { formatMoney } from '@/lib/money';
import { font, spacing, stackAtFontScale, useColors } from '@/theme/tokens';

/**
 * Prêts et dettes sur la Synthèse : ce qu'on doit au groupe, ce qu'il doit, et l'entrée vers l'écran de suivi.
 *
 * Toujours présente, même sans dette en cours : c'est la seule porte vers le module, et savoir qu'on peut noter le prêt au cousin est la moitié de son utilité. Les deux montants viennent de debts_totals(), sommés en base.
 */
export function DebtsEntry() {
  const colors = useColors();
  const { fontScale } = useWindowDimensions();
  const { totals } = useDebtTotals();
  const stacked = fontScale >= stackAtFontScale;

  const open = totals !== undefined && totals.openCount > 0;
  const detail = !totals
    ? 'Voir'
    : open
      ? `On vous doit ${formatMoney(totals.owedToUs)}, vous devez ${formatMoney(totals.weOwe)}`
      : 'Aucun prêt ni dette en cours';

  return (
    <Card>
      <View style={styles.cardHead}>
        <View style={styles.cardTitle}>
          <MaterialCommunityIcons name="handshake-outline" size={18} color={colors.primary} />
          <Text style={[styles.heading, { color: colors.text }]}>Prêts et dettes</Text>
        </View>
        <Link href="/debts" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel={`Prêts et dettes. ${detail}`}>
            <Text style={[styles.link, { color: colors.primary }]}>{open ? 'Tout voir' : 'Ouvrir'}</Text>
          </Pressable>
        </Link>
      </View>

      {open && totals ? (
        <View style={[styles.split, stacked && styles.splitStacked]}>
          <View style={styles.stat}>
            <Text style={[styles.statKey, { color: colors.textMuted }]}>On vous doit</Text>
            <Text style={[styles.statValue, { color: colors.positive }]}>
              {formatMoney(totals.owedToUs)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statKey, { color: colors.textMuted }]}>Vous devez</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{formatMoney(totals.weOwe)}</Text>
          </View>
        </View>
      ) : (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Notez ce que vous prêtez à un proche, ce que vous empruntez ou ce qu’un client vous
          doit, et suivez les remboursements jusqu’au dernier franc.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  heading: {
    fontFamily: font.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  link: {
    fontFamily: font.semibold,
    fontSize: 15,
    paddingVertical: spacing.sm,
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
    fontSize: 20,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 21,
  },
});
