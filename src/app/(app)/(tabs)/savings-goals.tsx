import { Link, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SavingsGoalRow } from '@/components/savings/savings-goal-row';
import { Screen } from '@/components/ui/screen';
import { useSavingsGoals } from '@/hooks/use-savings-goals';
import { dataErrorMessage } from '@/lib/data-errors';
import { savingsProgress } from '@/lib/savings-progress';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

/**
 * Objectifs d'épargne (spec 2.5, écran 6).
 *
 * Portée personnelle : useSavingsGoals() ne prend aucun paramètre de groupe,
 * la policy RLS ne renvoie déjà que les objectifs de l'utilisateur courant.
 */
export default function SavingsGoalsScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const router = useRouter();
  const { goals, isLoading, error, isLoadingError } = useSavingsGoals();

  const items = useMemo(() => goals.map(savingsProgress), [goals]);

  // Seul l'échec du tout premier chargement bloque l'écran : TanStack garde
  // les dernières données valides après un rafraîchissement raté en
  // arrière-plan — même règle que budgets.tsx et activity.tsx.
  const blockingError: unknown = isLoadingError ? error : null;

  return (
    <Screen
      align="top"
      floatingAction={
        <Link href="/savings-goal" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter un objectif"
            // Aplati : <Link asChild> transmet le style à son enfant via un
            // Slot, qui lève une erreur de rendu en développement s'il reçoit
            // un tableau.
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
        <Text style={[styles.title, { color: colors.text }]}>Objectifs d’épargne</Text>
      </View>

      {blockingError ? (
        <Text style={[styles.message, { color: colors.danger }]}>
          {dataErrorMessage(blockingError)}
        </Text>
      ) : isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : items.length === 0 ? (
        <Text style={[styles.message, { color: colors.textMuted }]}>
          Aucun objectif défini. Touchez + pour en créer un.
        </Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <SavingsGoalRow
              key={item.goal.id}
              item={item}
              onPress={() => router.push(`/savings-goal?id=${item.goal.id}`)}
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
