import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useBudgetProgress } from '@/hooks/use-budget-progress';
import { formatAmount } from '@/lib/money';
import { font, spacing, stackAtFontScale, useColors } from '@/theme/tokens';

/** Enveloppes détaillées sur le tableau de bord avant de renvoyer à l'onglet. */
const PREVIEW_COUNT = 3;

/**
 * Résume l'état des budgets en une phrase.
 *
 * Le compte des dépassements passe avant celui des alertes : c'est l'information qui appelle une action.
 */
function summarise(over: number, warning: number, total: number): string {
  if (total === 0) {
    return 'À définir';
  }
  if (over === 0 && warning === 0) {
    return total === 1 ? '1 budget suivi' : `${total} budgets suivis`;
  }

  const parts: string[] = [];
  if (over > 0) {
    // « plafond atteint » et non « dépassé » : le statut `over` commence à exactement 100 %, où rien n'est encore dépassé. Un budget dépassé a forcément atteint son plafond, donc la formule est juste dans les deux cas.
    parts.push(over === 1 ? '1 plafond atteint' : `${over} plafonds atteints`);
  }
  if (warning > 0) {
    parts.push(warning === 1 ? '1 proche de la limite' : `${warning} proches de la limite`);
  }
  return parts.join(', ');
}

export function BudgetsEntry() {
  const colors = useColors();
  const { fontScale } = useWindowDimensions();
  const { items, isLoading, error } = useBudgetProgress();

  // Ni squelette ni message d'erreur : cette ligne est d'abord un point d'entrée. Un budget dont l'état est inconnu se rejoint quand même, et un bandeau d'erreur de plus sur le tableau de bord n'apprendrait rien que la carte de résumé ne dise déjà.
  const over = items.filter((item) => item.status === 'over').length;
  const warning = items.filter((item) => item.status === 'warning').length;

  // Au-delà du seuil, le libellé et le détail s'empilent plutôt que de se disputer la largeur — comme les autres rangées à deux colonnes du projet.
  const stacked = fontScale >= stackAtFontScale;

  const accent = over > 0 ? colors.danger : warning > 0 ? colors.warning : colors.textMuted;
  // TanStack Query garde les dernières données valides quand un refetch en arrière-plan échoue : tant que `items` contient quelque chose, on montre l'état du dernier succès plutôt qu'un « Voir » neutre qui contredirait la pastille de couleur calculée sur ces mêmes données. « Voir » ne revient que lorsqu'il n'y a réellement rien à résumer.
  const detail =
    (isLoading || error) && items.length === 0 ? 'Voir' : summarise(over, warning, items.length);

  // Les plus urgents d'abord : `budgetProgress()` a déjà trié par statut puis par ratio, il n'y a qu'à prendre la tête de liste.
  const preview = items.slice(0, PREVIEW_COUNT);

  return (
    <Card>
      <View style={styles.cardHead}>
        <View style={styles.cardTitle}>
          <MaterialCommunityIcons name="wallet-outline" size={18} color={colors.primary} />
          <Text style={[styles.heading, { color: colors.text }]}>Enveloppes</Text>
        </View>
        <Link href="/budgets" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel={`Budgets. ${detail}`}>
            <Text style={[styles.link, { color: colors.primary }]}>Tout voir</Text>
          </Pressable>
        </Link>
      </View>

      {preview.length === 0 ? (
        <Text style={[styles.detail, { color: accent }]}>{detail}</Text>
      ) : (
        <View style={styles.rows}>
          {preview.map((item) => {
            const name = item.budget.category?.name ?? 'Catégorie inconnue';
            const percent = Math.round(item.ratio * 100);

            return (
              <View key={item.budget.id} style={styles.row}>
                <View style={[styles.rowHead, stacked && styles.rowHeadStacked]}>
                  <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                    {name}
                  </Text>
                  <Text
                    style={[
                      styles.amounts,
                      {
                        color:
                          item.status === 'over'
                            ? colors.danger
                            : item.status === 'warning'
                              ? colors.warning
                              : colors.textMuted,
                      },
                    ]}
                  >
                    {formatAmount(item.spent)} / {formatAmount(item.budget.amount)} €
                  </Text>
                </View>
                <ProgressBar
                  ratio={item.spent === 0 ? 0 : item.ratio}
                  tone={item.status}
                />
                <Text style={[styles.percent, { color: colors.textMuted }]}>{percent} %</Text>
              </View>
            );
          })}
        </View>
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
    flexShrink: 0,
  },
  rows: {
    gap: spacing.md,
  },
  row: {
    gap: spacing.xs + 2,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowHeadStacked: {
    // Le nom et les montants cèdent chacun leur propre ligne au lieu de se rétrécir l'un l'autre.
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 16,
    flexShrink: 1,
  },
  amounts: {
    fontFamily: font.semibold,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  percent: {
    fontFamily: font.medium,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  detail: {
    fontFamily: font.medium,
    fontSize: 15,
    flexShrink: 1,
  },
});
