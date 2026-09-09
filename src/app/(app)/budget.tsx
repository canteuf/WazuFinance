import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { BudgetForm, type BudgetFormValues } from '@/components/budget/budget-form';
import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useBudgetMutations } from '@/hooks/use-budget-mutations';
import { useBudgets } from '@/hooks/use-budgets';
import { useCategories } from '@/hooks/use-categories';
import { useCategoryBreakdown } from '@/hooks/use-category-breakdown';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Une seule route pour les deux modes : création sans paramètre, édition avec
 * ?id=. Même parti que pour les transactions — le formulaire est écrit et
 * corrigé une seule fois.
 */
export default function BudgetScreen() {
  const colors = useColors();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { activeGroupId, isLoading: groupLoading, error: groupError } = useActiveGroup();
  const { budgets, isLoading: budgetsLoading, error: budgetsError } = useBudgets();
  const { categories, isLoading: categoriesLoading } = useCategories('expense');
  const { slices, isLoading: slicesLoading } = useCategoryBreakdown();
  const { createBudget, updateBudget, deleteBudget, isSaving, isDeleting } = useBudgetMutations();
  const [errorText, setErrorText] = useState<string>();

  const existing = typeof id === 'string' ? budgets.find((budget) => budget.id === id) : undefined;

  /**
   * Catégories de dépense sans budget, les plus dépensées d'abord.
   *
   * C'est là que se fait la découverte : l'écran 5 ne liste que les budgets
   * définis, donc c'est au moment de choisir qu'on montre où l'argent part
   * vraiment. Une catégorie absente de la répartition n'a rien coûté sur la
   * période et se range après celles qui ont coûté.
   */
  const availableCategories = useMemo(() => {
    const budgeted = new Set(budgets.map((budget) => budget.category_id));
    const spentByCategory = new Map(slices.map((slice) => [slice.categoryId, slice.total]));

    return categories
      .filter((category) => !budgeted.has(category.id))
      .sort((a, b) => {
        const spentDelta =
          (spentByCategory.get(b.id) ?? 0) - (spentByCategory.get(a.id) ?? 0);
        return spentDelta !== 0 ? spentDelta : a.name.localeCompare(b.name, 'fr');
      });
  }, [budgets, categories, slices]);

  // Les quatre requêtes se chargent en parallèle ; tant qu'une seule d'entre
  // elles n'est pas arrivée, `categories`/`slices` valent [] par défaut de
  // leur hook, ce qui rendrait à tort « Toutes les catégories de dépense ont
  // déjà un budget. » si on ne couvrait pas aussi ces deux chargements.
  if (groupLoading || budgetsLoading || categoriesLoading || slicesLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (groupError || !activeGroupId) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          {groupError ? dataErrorMessage(groupError) : 'Aucun groupe actif.'}
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  // Une panne réseau ou un refus RLS sur useBudgets() laisse `budgets = []` :
  // sans ce garde, l'édition afficherait à tort « Ce budget n'existe plus »
  // et la création laisserait réapparaître des catégories déjà budgétées
  // comme disponibles, qui n'échoueraient qu'au 23505 en enregistrant.
  if (budgetsError) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          {dataErrorMessage(budgetsError)}
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  // Le budget visé n'est plus dans la liste : supprimé par un autre membre
  // pendant que la feuille était ouverte, ou identifiant périmé. Sans ce
  // garde, le formulaire s'ouvrirait vide sous le titre « Modifier » et
  // l'enregistrer créerait un doublon.
  if (typeof id === 'string' && !existing) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          Ce budget n’existe plus.
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  function handleSubmit(values: BudgetFormValues) {
    setErrorText(undefined);

    if (existing) {
      updateBudget.mutate(
        { id: existing.id, patch: { amount: values.amount } },
        {
          onSuccess: () => router.back(),
          onError: (error) => setErrorText(dataErrorMessage(error)),
        }
      );
      return;
    }

    createBudget.mutate(
      { groupId: activeGroupId as string, categoryId: values.categoryId, amount: values.amount },
      {
        onSuccess: () => router.back(),
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  function handleDelete() {
    if (!existing) {
      return;
    }
    deleteBudget.mutate(existing.id, {
      onSuccess: () => router.back(),
      onError: (error) => setErrorText(dataErrorMessage(error)),
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
          {existing ? 'Modifier le budget' : 'Nouveau budget'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          hitSlop={spacing.sm}
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Text style={[styles.closeLabel, { color: colors.textMuted }]}>✕</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <BudgetForm
          availableCategories={availableCategories}
          initialValues={
            existing
              ? { categoryId: existing.category_id, amount: existing.amount }
              : undefined
          }
          lockedCategory={
            existing
              ? { id: existing.category.id, name: existing.category.name }
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
  closeLabel: {
    fontFamily: font.semibold,
    fontSize: 18,
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
