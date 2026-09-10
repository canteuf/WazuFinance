import { Link, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BudgetRow } from '@/components/budget/budget-row';
import { Screen } from '@/components/ui/screen';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useBudgetProgress } from '@/hooks/use-budget-progress';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

/**
 * Budgets par catégorie (spec 2.4, écran 5).
 *
 * La liste ne montre que les budgets définis : les quatorze catégories par
 * défaut afficheraient douze lignes vides pour deux utiles, et la progression
 * — le point de l'écran — se noierait. La découverte se fait dans le
 * formulaire de création, qui classe les catégories sans budget par dépense
 * réelle de la période.
 */
export default function BudgetsScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const router = useRouter();
  const { isLoading: groupLoading, error: groupError, activeGroupId } = useActiveGroup();
  const { items, isLoading, error, isEmptyError } = useBudgetProgress();

  // Seules bloquent les erreurs qui ne laissent rien de juste à montrer.
  // TanStack garde les dernières données valides et ne remplit `error`
  // qu'après l'échec d'un rafraîchissement en arrière-plan : revenir hors ligne
  // au premier plan après plus de 30 s ne doit pas remplacer des budgets déjà
  // affichés par un message d'erreur — même règle que activity.tsx.
  const blockingError: unknown =
    groupError !== null && activeGroupId === null ? groupError : isEmptyError ? error : null;

  return (
    <Screen
      align="top"
      floatingAction={
        <Link href="/budget" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter un budget"
            style={StyleSheet.flatten([
              styles.fab,
              elevation.floating,
              { backgroundColor: colors.primary },
            ])}
          >
            <Text style={[styles.fabLabel, { color: colors.primaryText }]}>+</Text>
          </Pressable>
        </Link>
      }
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={spacing.sm}
          onPress={() => router.back()}
        >
          <Text style={[styles.back, { color: colors.textMuted }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Budgets</Text>
      </View>

      {blockingError ? (
        // Si le chargement des adhésions échoue, `activeGroupId` reste `null` :
        // `useBudgetProgress()` reste alors désactivé (ni chargement ni
        // erreur) et sans ce garde l'écran afficherait à tort « Aucun budget
        // défini » au lieu du vrai message — même motif que budget.tsx.
        <Text style={[styles.message, { color: colors.danger }]}>
          {dataErrorMessage(blockingError)}
        </Text>
      ) : isLoading || groupLoading ? (
        // Tant que le groupe actif n'est pas résolu, `useBudgets` et
        // `useCategoryBreakdown` sont désactivées : leur `isLoading` reste à
        // `false` et affichait un instant « Aucun budget défini » avant le
        // premier vrai chargement (même course que history.tsx).
        <ActivityIndicator color={colors.primary} />
      ) : items.length === 0 ? (
        <Text style={[styles.message, { color: colors.textMuted }]}>
          Aucun budget défini. Touchez + pour fixer un plafond sur une catégorie.
        </Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <BudgetRow
              key={item.budget.id}
              item={item}
              onPress={() => router.push(`/budget?id=${item.budget.id}`)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  back: {
    fontFamily: font.semibold,
    fontSize: 30,
    lineHeight: 34,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  list: {
    gap: spacing.sm + 2,
  },
  message: {
    fontFamily: font.regular,
    fontSize: 14,
    paddingVertical: spacing.lg,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: radius.lg + 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabLabel: {
    fontFamily: font.medium,
    fontSize: 30,
    lineHeight: 34,
  },
});
