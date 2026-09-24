import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BudgetForm, type BudgetFormValues } from '@/components/budget/budget-form';
import { AmountAdjuster } from '@/components/ui/amount-adjuster';
import { Button } from '@/components/ui/button';
import { DeleteAction } from '@/components/ui/form-actions';
import { ProgressBar } from '@/components/ui/progress-bar';
import { CONTENT_GUTTER, contentColumn } from '@/components/ui/screen';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useBudgetMutations } from '@/hooks/use-budget-mutations';
import { useBudgets } from '@/hooks/use-budgets';
import { useCategories } from '@/hooks/use-categories';
import { useCategoryBreakdown } from '@/hooks/use-category-breakdown';
import { useSheetMaxHeight } from '@/hooks/use-sheet-max-height';
import { budgetProgress, WARNING_RATIO } from '@/lib/budget-progress';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatMoney } from '@/lib/money';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';
import { goBackOr } from '@/lib/navigation';

/**
 * Une seule route pour les deux modes : création sans paramètre, ajustement avec ?id=.
 *
 * Le plafond d'une enveloppe existante ne se réécrit pas : il s'augmente ou se réduit d'un montant, et adjust_budget_amount() fait l'addition en base. Dans un budget partagé, deux membres qui ajustent la même enveloppe voient ainsi leurs deux ajustements comptés, là où la réécriture faisait gagner le dernier.
 */
export default function BudgetScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const router = useRouter();
  const sheetMaxHeight = useSheetMaxHeight();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { activeGroupId, isLoading: groupLoading, error: groupError } = useActiveGroup();
  const { budgets, isLoading: budgetsLoading, error: budgetsError } = useBudgets();
  const {
    categories,
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategories('expense');
  const { slices, isLoading: slicesLoading, error: slicesError } = useCategoryBreakdown();
  const { createBudget, adjustBudget, deleteBudget, isDeleting } = useBudgetMutations();
  const [errorText, setErrorText] = useState<string>();

  const existing = typeof id === 'string' ? budgets.find((budget) => budget.id === id) : undefined;
  // La dépense de l'enveloppe, par la même fonction que la liste : la feuille et la carte touchée affichent les mêmes chiffres.
  const progress = useMemo(
    () => (existing ? budgetProgress([existing], slices)[0] : undefined),
    [existing, slices]
  );

  /**
   * Catégories de dépense sans budget, les plus dépensées d'abord.
   *
   * C'est là que se fait la découverte : l'écran 5 ne liste que les budgets définis, donc c'est au moment de choisir qu'on montre où l'argent part vraiment. Une catégorie absente de la répartition n'a rien coûté sur la période et se range après celles qui ont coûté.
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

  // Les quatre requêtes se chargent en parallèle ; tant qu'une seule d'entre elles n'est pas arrivée, `categories`/`slices` valent [] par défaut de leur hook, ce qui rendrait à tort « Toutes les catégories de dépense ont déjà une enveloppe. » si on ne couvrait pas aussi ces deux chargements.
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
        <Button title="Retour" variant="ghost" onPress={() => goBackOr(router, '/budgets')} />
      </View>
    );
  }

  // Une panne réseau ou un refus RLS sur l'une de ces trois requêtes laisse sa donnée à vide : sans ce garde, l'ajustement afficherait à tort « Cette enveloppe n'existe plus », et la création « Toutes les catégories de dépense ont déjà une enveloppe. ».
  if (budgetsError || categoriesError || slicesError) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          {dataErrorMessage(budgetsError ?? categoriesError ?? slicesError)}
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => goBackOr(router, '/budgets')} />
      </View>
    );
  }

  // Le budget visé n'est plus dans la liste : supprimé par un autre membre pendant que la feuille était ouverte, ou identifiant périmé.
  if (typeof id === 'string' && (!existing || !progress)) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          Cette enveloppe n’existe plus.
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => goBackOr(router, '/budgets')} />
      </View>
    );
  }

  function handleCreate(values: BudgetFormValues) {
    setErrorText(undefined);
    createBudget.mutate(
      { groupId: activeGroupId as string, categoryId: values.categoryId, amount: values.amount },
      {
        onSuccess: () => goBackOr(router, '/budgets'),
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  function handleAdjust(delta: number) {
    if (!existing) {
      return;
    }
    setErrorText(undefined);
    adjustBudget.mutate(
      { id: existing.id, delta },
      {
        onSuccess: () => goBackOr(router, '/budgets'),
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  function handleDelete() {
    if (!existing) {
      return;
    }
    deleteBudget.mutate(existing.id, {
      onSuccess: () => goBackOr(router, '/budgets'),
      onError: (error) => setErrorText(dataErrorMessage(error)),
    });
  }

  const title = existing
    ? // `existing.category` peut être `null` : RLS masque la ligne jointe quand le budget pointe une catégorie hors de portée du groupe.
      (existing.category?.name ?? 'Catégorie inconnue')
    : 'Nouvelle enveloppe';

  return (
    <View
      style={[
        styles.sheet,
        { backgroundColor: colors.background, maxHeight: sheetMaxHeight },
      ]}
    >
      {/* Une formSheet n'accepte pas de header natif : le titre et la fermeture sont du contenu ordinaire, comme sur la saisie. */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          hitSlop={spacing.sm}
          onPress={() => goBackOr(router, '/budgets')}
          style={styles.close}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
          <Text style={[styles.closeLabel, { color: colors.text }]}>Fermer</Text>
        </Pressable>
      </View>

      <View style={styles.titleBlock}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
          {existing ? 'Ajuster l’enveloppe' : 'Définir un plafond'}
        </Text>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>
      </View>

      <ScrollView
        // La feuille centre ses blocs (`alignItems: 'center'`) : sans cette largeur explicite, le ScrollView se réduirait à la largeur de son contenu, que son propre conteneur exprime en pourcentage de lui — une mesure qui ne converge pas.
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {existing && progress ? (
          <>
            <View style={[styles.status, { backgroundColor: colors.surface }, elevation.card]}>
              <View style={styles.statusRow}>
                <Text style={[styles.statusSpent, { color: colors.text }]}>
                  {formatMoney(progress.spent)}
                </Text>
                <Text style={[styles.statusCeiling, { color: colors.textMuted }]}>
                  dépensés sur {formatMoney(existing.amount)}
                </Text>
              </View>
              <ProgressBar
                ratio={progress.spent === 0 ? 0 : progress.ratio}
                tone={progress.status}
                size="lg"
              />
            </View>

            <AmountAdjuster
              options={{
                add: { label: 'Augmenter', icon: 'arrow-up' },
                remove: { label: 'Réduire', icon: 'arrow-down' },
              }}
              current={existing.amount}
              minimumAfter={1}
              amountLabel={(mode) =>
                mode === 'add' ? 'Ajouter au plafond' : 'Retirer du plafond'
              }
              previewLabel="Nouveau plafond"
              previewDetail={(next) =>
                `Alerte à ${formatMoney(next * WARNING_RATIO)} ·${Math.round((progress.spent / next) * 100)} % déjà dépensés`
              }
              submitLabel={(mode) =>
                mode === 'add' ? 'Augmenter le plafond' : 'Réduire le plafond'
              }
              tooLowMessage="Le plafond doit rester supérieur à zéro. Pour ne plus suivre cette catégorie, supprimez l’enveloppe."
              submitting={adjustBudget.isPending}
              errorText={errorText}
              onSubmit={handleAdjust}
            />

            {/* Déplacer une enveloppe d'une catégorie à l'autre reviendrait à en supprimer une et à en créer une autre, et buterait sur l'unicité si la cible en a déjà une. Supprimer puis recréer est explicite. */}
            <DeleteAction
              label="Supprimer cette enveloppe"
              confirmAccessibilityLabel="Confirmer la suppression définitive de cette enveloppe"
              deleting={isDeleting}
              disabled={adjustBudget.isPending}
              onConfirm={handleDelete}
            />
          </>
        ) : (
          <BudgetForm
            availableCategories={availableCategories}
            submitting={createBudget.isPending}
            errorText={errorText}
            onSubmit={handleCreate}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    // Le fond garde la pleine largeur de la feuille ; ce sont les blocs qui se centrent, sur la même colonne que les écrans (voir `contentColumn`). Sans cela, le contenu d'une feuille s'étalait d'un bord à l'autre sur une tablette là où les cartes des écrans s'arrêtent à 420 points.
    alignItems: 'center',
  },
  header: {
    ...contentColumn,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingHorizontal: CONTENT_GUTTER,
  },
  close: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  closeLabel: {
    fontFamily: font.semibold,
    fontSize: 18,
  },
  titleBlock: {
    ...contentColumn,
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
    paddingHorizontal: CONTENT_GUTTER,
  },
  eyebrow: {
    fontFamily: font.semibold,
    fontSize: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: font.black,
    fontSize: 28,
    letterSpacing: -0.7,
    textAlign: 'center',
  },
  scroll: {
    alignSelf: 'stretch',
  },
  scrollContent: {
    ...contentColumn,
    flexGrow: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  status: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  statusSpent: {
    fontFamily: font.bold,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
  },
  statusCeiling: {
    fontFamily: font.regular,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  errorTitle: {
    fontFamily: font.medium,
    fontSize: 16,
    textAlign: 'center',
  },
});
