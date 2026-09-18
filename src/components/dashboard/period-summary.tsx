import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { usePeriodSummary } from '@/hooks/use-period-summary';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatBalance, formatDelta, formatSignedBare } from '@/lib/money';
import { font, radius, spacing, stackAtFontScale, useColors } from '@/theme/tokens';

/**
 * Même plafond, et pour la même raison, que le champ montant de la saisie : la largeur disponible pour le solde est celle de l'écran, pas celle d'un conteneur qu'on peut élargir. Partout ailleurs on suit l'échelle système.
 */
const MAX_FONT_SCALE = 1.4;

/**
 * Solde de la période en cours, entrées et sorties.
 *
 * Le solde n'est pas posé sur une carte : il s'inscrit à même le fond, en tête de l'écran, et c'est ce qui en fait l'élément dominant. Seules les deux statistiques sont encadrées — leur cadre les désigne comme un détail du chiffre au-dessus, pas comme son égal.
 *
 * L'erreur reste locale : si le résumé échoue alors que les dernières opérations sont arrivées, masquer la liste priverait de ce qui fonctionne.
 */
export function PeriodSummary() {
  const colors = useColors();
  const { fontScale } = useWindowDimensions();
  const { summary, previous, label, isLoading, error } = usePeriodSummary();

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
          {/* Un solde négatif en cours de période est ordinaire, pas une alerte : il reste en couleur de texte. Seul son signe l'annonce. */}
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[styles.balance, { color: colors.text }]}
          >
            {formatBalance(summary.balance)}
          </Text>
          {/* Le symbole est plus petit et en retrait : il accompagne le chiffre au lieu de lui disputer sa place. */}
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[styles.currency, { color: colors.textMuted }]}
          >
            €
          </Text>
        </View>

        {/* Comparaison de la spec 2.6. Absente tant que la période précédente charge, et surtout tant qu'elle n'a rien contenu : comparer à une période sans aucune opération produirait un écart égal au solde courant, qui se lirait comme une progression alors qu'il n'y a simplement rien eu avant. */}
        {previous && (previous.income !== 0 || previous.expense !== 0) ? (
          (() => {
            const delta = summary.balance - previous.balance;
            const up = delta >= 0;

            return (
              // Pastille plutôt que ligne de texte : l'écart est une information autonome, pas la suite de la phrase du solde. Le fond la détache du chiffre sans lui disputer sa taille.
              <View style={[styles.delta, { backgroundColor: colors.surfaceMuted }]}>
                <MaterialCommunityIcons
                  name={up ? 'arrow-up' : 'arrow-down'}
                  size={13}
                  // Un recul reste en couleur de texte, pas en danger : dépenser plus qu'à la période précédente est ordinaire.
                  color={up ? colors.positive : colors.text}
                />
                <Text
                  style={[styles.deltaText, { color: up ? colors.positive : colors.text }]}
                >
                  {formatDelta(delta)} €
                </Text>
                <Text style={[styles.deltaText, { color: colors.textMuted }]}>
                  vs période précédente
                </Text>
              </View>
            );
          })()
        ) : null}
      </View>

      <View style={[styles.split, stacked && styles.splitStacked]}>
        <Card style={[styles.stat, stacked ? styles.statStacked : null]}>
          <View style={styles.statHead}>
            <Text style={[styles.statKey, { color: colors.textMuted }]}>Entrées</Text>
            <View style={[styles.statIcon, { backgroundColor: colors.surfaceMuted }]}>
              <MaterialCommunityIcons
                name="arrow-bottom-left"
                size={13}
                color={colors.positive}
              />
            </View>
          </View>
          {/* Entrées en positif, sorties en neutre : même convention que la liste des opérations, où seul un revenu se colore. */}
          <Text style={[styles.statValue, { color: colors.positive }]}>
            {formatSignedBare(summary.income, 'income')}
          </Text>
        </Card>

        <Card style={[styles.stat, stacked ? styles.statStacked : null]}>
          <View style={styles.statHead}>
            <Text style={[styles.statKey, { color: colors.textMuted }]}>Sorties</Text>
            <View style={[styles.statIcon, { backgroundColor: colors.surfaceMuted }]}>
              <MaterialCommunityIcons
                name="arrow-top-right"
                size={13}
                color={colors.textMuted}
              />
            </View>
          </View>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {formatSignedBare(summary.expense, 'expense')}
          </Text>
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md + 2,
  },
  balanceBlock: {
    // Entre le libellé de période et le montant : l'écart précédent collait les deux, alors que le libellé doit se lire comme un intertitre.
    gap: spacing.sm + 2,
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
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    paddingVertical: spacing.xs + 1,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    // Se limite à son contenu : étirée, la pastille se lirait comme une barre.
    alignSelf: 'flex-start',
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  deltaText: {
    fontFamily: font.semibold,
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
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
    gap: spacing.xs,
  },
  statStacked: {
    // En colonne, flex: 1 ferait partager aux deux blocs une hauteur que rien ne fixe : ils se réduiraient à zéro. On les laisse à leur hauteur de contenu et on les étire en largeur.
    flex: 0,
    alignSelf: 'stretch',
  },
  statHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statIcon: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statKey: {
    fontFamily: font.semibold,
    fontSize: 10.5,
    letterSpacing: 0.4,
    flexShrink: 1,
  },
  statValue: {
    fontFamily: font.semibold,
    fontSize: 18,
    letterSpacing: -0.25,
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
