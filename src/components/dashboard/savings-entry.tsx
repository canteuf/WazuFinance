import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useSavingsGoals } from '@/hooks/use-savings-goals';
import { savingsProgress } from '@/lib/savings-progress';
import { font, radius, spacing, stackAtFontScale, useColors } from '@/theme/tokens';

/**
 * Résume les objectifs d'épargne en une phrase.
 *
 * Même formule que BudgetsEntry, avec une seule dimension (atteint ou non)
 * au lieu de deux (dépassé/proche) : la spec 2.5 ne demande pas de palier
 * d'alerte comme la 2.4 le fait pour les budgets.
 */
function summarise(total: number, reached: number): string {
  if (total === 0) {
    return 'À définir';
  }
  const base = total === 1 ? '1 objectif suivi' : `${total} objectifs suivis`;
  if (reached === 0) {
    return base;
  }
  return `${base}, ${reached === 1 ? '1 atteint' : `${reached} atteints`}`;
}

export function SavingsEntry() {
  const colors = useColors();
  const { fontScale } = useWindowDimensions();
  const { goals, isLoading, error } = useSavingsGoals();

  const items = goals.map(savingsProgress);
  const reached = items.filter((item) => item.status === 'reached').length;

  // Au-delà du seuil, le libellé et le détail s'empilent plutôt que de se
  // disputer la largeur — comme les autres rangées à deux colonnes du projet.
  const stacked = fontScale >= stackAtFontScale;

  const accent = reached > 0 ? colors.positive : colors.textMuted;
  // TanStack Query garde les dernières données valides quand un refetch en
  // arrière-plan échoue : tant que `goals` contient quelque chose, on montre
  // l'état du dernier succès plutôt qu'un « Voir » neutre — même motif que
  // BudgetsEntry.
  const detail =
    (isLoading || error) && goals.length === 0 ? 'Voir' : summarise(items.length, reached);

  return (
    <Link href="/savings-goals" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Objectifs d’épargne. ${detail}`}
        // Aplati : <Link asChild> transmet le style à son enfant via un Slot,
        // qui lève une erreur de rendu en développement s'il reçoit un tableau.
        style={StyleSheet.flatten([
          styles.row,
          stacked && styles.rowStacked,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ])}
      >
        <View style={styles.left}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={[styles.label, { color: colors.text }]}>Objectifs d’épargne</Text>
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
