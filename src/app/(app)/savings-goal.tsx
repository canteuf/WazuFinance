import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  SavingsGoalForm,
  type SavingsGoalFormValues,
} from '@/components/savings/savings-goal-form';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useSavingsGoalMutations } from '@/hooks/use-savings-goal-mutations';
import { useSavingsGoals } from '@/hooks/use-savings-goals';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, spacing, useColors } from '@/theme/tokens';
import { goBackOr } from '@/lib/navigation';

/**
 * Une seule route pour les deux modes : création sans paramètre, édition avec ?id=. Même parti que budget.tsx et transaction.tsx.
 */
export default function SavingsGoalScreen() {
  const colors = useColors();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { goals, isLoading, error } = useSavingsGoals();
  const { createGoal, updateGoal, deleteGoal, isSaving, isDeleting } = useSavingsGoalMutations();
  const [errorText, setErrorText] = useState<string>();

  const existing = typeof id === 'string' ? goals.find((goal) => goal.id === id) : undefined;

  // Tous les hooks ci-dessus s'exécutent à chaque rendu ; les retours conditionnels qui suivent n'en court-circuitent aucun.
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // En pratique toujours vrai ici : les routes (app) ne sont atteignables qu'avec une session (garde Stack.Protected du layout racine). Ce garde évite une assertion non sûre plutôt que de documenter un cas impossible.
  if (error || !userId) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          {error ? dataErrorMessage(error) : 'Session introuvable.'}
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => goBackOr(router, '/savings-goals')} />
      </View>
    );
  }

  // L'objectif visé n'est plus dans la liste : supprimé pendant que la feuille était ouverte (un autre appareil du même compte), ou identifiant périmé. Sans ce garde, le formulaire s'ouvrirait vide sous « Modifier ».
  if (typeof id === 'string' && !existing) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          Cet objectif n’existe plus.
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => goBackOr(router, '/savings-goals')} />
      </View>
    );
  }

  function handleSubmit(values: SavingsGoalFormValues) {
    setErrorText(undefined);

    if (existing) {
      updateGoal.mutate(
        { id: existing.id, patch: values },
        {
          onSuccess: () => goBackOr(router, '/savings-goals'),
          onError: (mutationError) => setErrorText(dataErrorMessage(mutationError)),
        }
      );
      return;
    }

    createGoal.mutate(
      { ...values, userId: userId as string },
      {
        onSuccess: () => goBackOr(router, '/savings-goals'),
        onError: (mutationError) => setErrorText(dataErrorMessage(mutationError)),
      }
    );
  }

  function handleDelete() {
    if (!existing) {
      return;
    }
    deleteGoal.mutate(existing.id, {
      onSuccess: () => goBackOr(router, '/savings-goals'),
      onError: (mutationError) => setErrorText(dataErrorMessage(mutationError)),
    });
  }

  return (
    <View
      style={[
        styles.sheet,
        { backgroundColor: colors.background, maxHeight: windowHeight * 0.92 },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {existing ? 'Modifier l’objectif' : 'Nouvel objectif'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          hitSlop={spacing.sm}
          onPress={() => goBackOr(router, '/savings-goals')}
          style={styles.closeButton}
        >
          <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <SavingsGoalForm
          initialValues={
            existing
              ? {
                  name: existing.name,
                  targetAmount: existing.target_amount,
                  currentAmount: existing.current_amount,
                  targetDate: existing.target_date,
                }
              : undefined
          }
          submitLabel={existing ? 'Enregistrer' : 'Ajouter'}
          submitting={isSaving}
          deleting={isDeleting}
          errorText={errorText}
          onSubmit={handleSubmit}
          onDelete={existing ? handleDelete : undefined}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  closeButton: {
    padding: spacing.xs,
  },
  scrollContent: {
    flexGrow: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  errorTitle: {
    fontFamily: font.medium,
    fontSize: 14,
    textAlign: 'center',
  },
});
