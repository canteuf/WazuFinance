import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { usePeriodSummary } from '@/hooks/use-period-summary';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatAmount } from '@/lib/money';
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
 * L'erreur reste locale à la carte : si le résumé échoue alors que les
 * dernières opérations sont arrivées, masquer la liste pour autant priverait
 * l'utilisateur de ce qui fonctionne.
 */
export function PeriodSummary() {
  const colors = useColors();
  const elevation = useElevation();
  const { fontScale } = useWindowDimensions();
  const { summary, label, isLoading, error } = usePeriodSummary();

  const stacked = fontScale >= stackAtFontScale;

  return (
    <View style={[styles.card, elevation.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>Solde {label}</Text>

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
      ) : isLoading || !summary ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <>
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[styles.balance, { color: colors.text }]}
          >
            {/* Le signe vient du solde lui-même : un solde négatif est une
                information ordinaire en cours de période, pas une alerte —
                d'où la couleur neutre plutôt que colors.danger. */}
            {summary.balance < 0 ? '-' : ''}
            {formatAmount(Math.abs(summary.balance))} €
          </Text>

          <View style={[styles.split, stacked && styles.splitStacked]}>
            <View style={styles.stat}>
              <Text style={[styles.statKey, { color: colors.textMuted }]}>Entrées</Text>
              {/* Entrées en positif, sorties en neutre : même convention que
                  la liste des opérations, où seul un revenu se colore. */}
              <Text style={[styles.statValue, { color: colors.positive }]}>
                {formatAmount(summary.income)} €
              </Text>
            </View>

            <View style={styles.stat}>
              <Text style={[styles.statKey, { color: colors.textMuted }]}>Sorties</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {formatAmount(summary.expense)} €
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 11.5,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  balance: {
    fontFamily: font.black,
    fontSize: 34,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  split: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  splitStacked: {
    // Au-delà du seuil, les deux colonnes ne tiennent plus côte à côte.
    flexDirection: 'column',
    gap: spacing.sm,
  },
  stat: {
    gap: 2,
  },
  statKey: {
    fontFamily: font.medium,
    fontSize: 12,
  },
  statValue: {
    fontFamily: font.bold,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  error: {
    fontFamily: font.medium,
    fontSize: 14,
    paddingVertical: spacing.xs,
  },
  loader: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.md,
  },
});
