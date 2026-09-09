import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useBudgetProgress } from '@/hooks/use-budget-progress';
import { font, radius, spacing, stackAtFontScale, useColors } from '@/theme/tokens';

/**
 * Résume l'état des budgets en une phrase.
 *
 * Le compte des dépassements passe avant celui des alertes : c'est
 * l'information qui appelle une action.
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
    parts.push(over === 1 ? '1 dépassé' : `${over} dépassés`);
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

  // Ni squelette ni message d'erreur : cette ligne est d'abord un point
  // d'entrée. Un budget dont l'état est inconnu se rejoint quand même, et un
  // bandeau d'erreur de plus sur le tableau de bord n'apprendrait rien que la
  // carte de résumé ne dise déjà.
  const over = items.filter((item) => item.status === 'over').length;
  const warning = items.filter((item) => item.status === 'warning').length;

  // Au-delà du seuil, le libellé et le détail s'empilent plutôt que de se
  // disputer la largeur — comme les autres rangées à deux colonnes du projet.
  const stacked = fontScale >= stackAtFontScale;

  const accent = over > 0 ? colors.danger : warning > 0 ? colors.warning : colors.textMuted;
  // TanStack Query garde les dernières données valides quand un refetch en
  // arrière-plan échoue : tant que `items` contient quelque chose, on montre
  // l'état du dernier succès plutôt qu'un « Voir » neutre qui contredirait la
  // pastille de couleur calculée sur ces mêmes données. « Voir » ne revient
  // que lorsqu'il n'y a réellement rien à résumer.
  const detail =
    (isLoading || error) && items.length === 0 ? 'Voir' : summarise(over, warning, items.length);

  return (
    <Link href="/budgets" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Budgets. ${detail}`}
        style={[
          styles.row,
          stacked && styles.rowStacked,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.left}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={[styles.label, { color: colors.text }]}>Budgets</Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.detail, { color: accent }]}>{detail}</Text>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  rowStacked: {
    // Le libellé et le détail cèdent chacun leur propre ligne au lieu de se
    // rétrécir l'un l'autre.
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    // Cède avant le libellé quand la police grossit.
    flexShrink: 1,
  },
  detail: {
    fontFamily: font.medium,
    fontSize: 13,
    flexShrink: 1,
  },
  chevron: {
    fontFamily: font.semibold,
    fontSize: 18,
    flexShrink: 0,
  },
});
