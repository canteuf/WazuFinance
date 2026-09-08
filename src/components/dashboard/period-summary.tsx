import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { usePeriodSummary } from '@/hooks/use-period-summary';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatBalance, formatSignedBare } from '@/lib/money';
import {
  font,
  radius,
  spacing,
  stackAtFontScale,
  useColors,
  useElevation,
} from '@/theme/tokens';

/**
 * Même plafond, et pour la même raison, que le champ montant de la saisie :
 * la largeur disponible pour le solde est celle de l'écran, pas celle d'un
 * conteneur qu'on peut élargir. Partout ailleurs on suit l'échelle système.
 */
const MAX_FONT_SCALE = 1.4;

/**
 * Solde de la période en cours, entrées et sorties.
 *
 * Le solde n'est pas posé sur une carte : il s'inscrit à même le fond, en tête
 * de l'écran, et c'est ce qui en fait l'élément dominant. Seules les deux
 * statistiques sont encadrées — leur cadre les désigne comme un détail du
 * chiffre au-dessus, pas comme son égal.
 *
 * L'erreur reste locale : si le résumé échoue alors que les dernières
 * opérations sont arrivées, masquer la liste priverait de ce qui fonctionne.
 */
export function PeriodSummary() {
  const colors = useColors();
  const elevation = useElevation();
  const { fontScale } = useWindowDimensions();
  const { summary, label, isLoading, error } = usePeriodSummary();

  const stacked = fontScale >= stackAtFontScale;

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Solde {label}</Text>
        <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
      </View>
    );
  }

  if (isLoading || !summary) {
    return (
      <View style={styles.container}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Solde {label}</Text>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.balanceBlock}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Solde {label}</Text>
        <View style={styles.balanceRow}>
          {/* Un solde négatif en cours de période est ordinaire, pas une
              alerte : il reste en couleur de texte. Seul son signe l'annonce. */}
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[styles.balance, { color: colors.text }]}
          >
            {formatBalance(summary.balance)}
          </Text>
          {/* Le symbole est plus petit et en retrait : il accompagne le
              chiffre au lieu de lui disputer sa place. */}
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[styles.currency, { color: colors.textMuted }]}
          >
            €
          </Text>
        </View>
      </View>

      <View style={[styles.split, stacked && styles.splitStacked]}>
        <View
          style={[
            styles.stat,
            stacked && styles.statStacked,
            elevation.card,
            { backgroundColor: colors.surface },
          ]}
        >
          <Text style={[styles.statKey, { color: colors.textMuted }]}>Entrées</Text>
          {/* Entrées en positif, sorties en neutre : même convention que la
              liste des opérations, où seul un revenu se colore. */}
          <Text style={[styles.statValue, { color: colors.positive }]}>
            {formatSignedBare(summary.income, 'income')}
          </Text>
        </View>

        <View
          style={[
            styles.stat,
            stacked && styles.statStacked,
            elevation.card,
            { backgroundColor: colors.surface },
          ]}
        >
          <Text style={[styles.statKey, { color: colors.textMuted }]}>Sorties</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {formatSignedBare(summary.expense, 'expense')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md - 3,
  },
  balanceBlock: {
    gap: spacing.xs + 2,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 0.77,
    textTransform: 'uppercase',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs + 2,
  },
  balance: {
    fontFamily: font.black,
    fontSize: 40,
    letterSpacing: -1.6,
    lineHeight: 42,
    fontVariant: ['tabular-nums'],
  },
  currency: {
    fontFamily: font.medium,
    fontSize: 22,
  },
  split: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  splitStacked: {
    // Au-delà du seuil, les deux blocs ne tiennent plus côte à côte.
    flexDirection: 'column',
  },
  stat: {
    flex: 1,
    borderRadius: radius.sm + 3,
    paddingVertical: spacing.sm + 1,
    paddingHorizontal: spacing.sm + 3,
    gap: 2,
  },
  statStacked: {
    // En colonne, flex: 1 ferait partager aux deux blocs une hauteur que rien
    // ne fixe : ils se réduiraient à zéro. On les laisse à leur hauteur de
    // contenu et on les étire en largeur.
    flex: 0,
    alignSelf: 'stretch',
  },
  statKey: {
    fontFamily: font.semibold,
    fontSize: 9.5,
    letterSpacing: 0.76,
    textTransform: 'uppercase',
  },
  statValue: {
    fontFamily: font.bold,
    fontSize: 15,
    letterSpacing: -0.15,
    fontVariant: ['tabular-nums'],
  },
  error: {
    fontFamily: font.medium,
    fontSize: 14,
  },
  loader: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
  },
});
