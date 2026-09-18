import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
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
 * Portée personnelle : useSavingsGoals() ne prend aucun paramètre de groupe, la policy RLS ne renvoie déjà que les objectifs de l'utilisateur courant.
 */
export default function SavingsGoalsScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const router = useRouter();
  const { goals, isLoading, error, isLoadingError } = useSavingsGoals();

  const items = useMemo(() => goals.map(savingsProgress), [goals]);
  const reached = items.filter((item) => item.status === 'reached').length;

  // Seul l'échec du tout premier chargement bloque l'écran : TanStack garde les dernières données valides après un rafraîchissement raté en arrière-plan — même règle que budgets.tsx et activity.tsx.
  const blockingError: unknown = isLoadingError ? error : null;

  return (
    <Screen
      align="top"
      inTabs
      floatingAction={
        <Link href="/savings-goal" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter un objectif"
            // Aplati : <Link asChild> transmet le style à son enfant via un Slot, qui lève une erreur de rendu en développement s'il reçoit un tableau.
            style={StyleSheet.flatten([
              styles.fab,
              elevation.floating,
              { backgroundColor: colors.primary },
            ])}
          >
            <MaterialCommunityIcons name="plus" size={28} color={colors.primaryText} />
          </Pressable>
        </Link>
      }
    >
      {/* Pas de bouton retour : destination d'onglet, pas page empilée. Le sous-titre compte les objectifs plutôt que d'afficher un total provisionné : sommer des montants ici passerait par des flottants binaires, et la règle du projet veut que les agrégats de montants soient calculés par Postgres. Aucun RPC ne le fait pour les objectifs, et en écrire un pour une ligne d'en-tête serait disproportionné. */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Objectifs</Text>
        {items.length > 0 ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {items.length === 1 ? '1 objectif' : `${items.length} objectifs`}
            {reached > 0 ? ` · ${reached === 1 ? '1 atteint' : `${reached} atteints`}` : ''}
          </Text>
        ) : null}
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
    gap: 3,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 12.5,
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
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
