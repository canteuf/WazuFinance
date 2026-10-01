import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { CATEGORY_ICONS } from '@/components/transaction/category-icons';
import { CategoryPicker } from '@/components/transaction/category-picker';
import { Button } from '@/components/ui/button';
import { DeleteAction, PrimaryAction } from '@/components/ui/form-actions';
import { IconChoiceGrid } from '@/components/ui/icon-choice-grid';
import { CONTENT_GUTTER, contentColumn } from '@/components/ui/screen';
import { SheetScrollView } from '@/components/ui/sheet-scroll-view';
import { TextField } from '@/components/ui/text-field';
import type { Category, CategoryUsage } from '@/data/categories';
import { useCategories, useCategoryUsage } from '@/hooks/use-categories';
import { useCategoryMutations } from '@/hooks/use-category-mutations';
import { useSheetMaxHeight } from '@/hooks/use-sheet-max-height';
import { useToast } from '@/hooks/use-toast';
import {
  CATEGORY_NAME_MAX_LENGTH,
  normalizeCategoryName,
  validateCategoryName,
} from '@/lib/category-name';
import { deletionSummary, needsReplacement, usageLabel } from '@/lib/category-usage';
import { dataErrorMessage } from '@/lib/data-errors';
import { goBackOr } from '@/lib/navigation';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Une catégorie du groupe : son nom, son icône, et sa suppression. Ouverte depuis la liste des catégories, avec ?id=.
 *
 * Une catégorie qui porte des opérations ou des modèles récurrents ne se supprime qu'en choisissant celle qui les recevra : laissées sans catégorie, les opérations sortiraient de la répartition des dépenses tout en comptant dans le total, ce qui se lit comme de l'argent disparu. Son budget, lui, part avec elle, et la fiche le dit avant la confirmation.
 */
export default function CategoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const sheetMaxHeight = useSheetMaxHeight();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { categories, isLoading } = useCategories(null);
  const { usage } = useCategoryUsage();
  const category = categories.find((item) => item.id === id && item.group_id !== null);

  function close() {
    goBackOr(router, '/categories');
  }

  if (isLoading) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!category) {
    return (
      <View style={styles.placeholder}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>Cette catégorie n’existe plus.</Text>
        <Button title="Retour" variant="ghost" onPress={close} />
      </View>
    );
  }

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background, maxHeight: sheetMaxHeight }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" numberOfLines={2}>
          {category.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          hitSlop={spacing.sm}
          onPress={close}
          style={styles.close}
        >
          <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} />
        </Pressable>
      </View>

      <SheetScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
      >
        {/* La clé remonte le formulaire sur une autre catégorie : ses champs partent de ses valeurs, pas de celles de la précédente. */}
        <EditForm
          key={category.id}
          category={category}
          siblings={categories.filter((item) => item.type === category.type && item.id !== category.id)}
          usage={usage?.get(category.id)}
          onDone={close}
        />
      </SheetScrollView>
    </View>
  );
}

function EditForm({
  category,
  siblings,
  usage,
  onDone,
}: {
  category: Category;
  /** Les autres catégories du même type que voit le groupe, par défaut comprises : homonymes interdits, et remplaçantes possibles. */
  siblings: Category[];
  usage: CategoryUsage | undefined;
  onDone: () => void;
}) {
  const colors = useColors();
  const toast = useToast();
  const { updateCategory, deleteCategory } = useCategoryMutations();

  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon);
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errorText, setErrorText] = useState<string>();

  const normalized = normalizeCategoryName(name);
  const nameError = validateCategoryName(normalized, siblings);
  const changed = normalized !== category.name || icon !== category.icon;
  const busy = updateCategory.isPending || deleteCategory.isPending;
  // Une icône hors de la liste courante (proposée par une version plus ancienne) reste visible et sélectionnée plutôt que de disparaître.
  const iconOptions = CATEGORY_ICONS.some((option) => option.name === category.icon)
    ? CATEGORY_ICONS
    : [{ name: category.icon as (typeof CATEGORY_ICONS)[number]['name'], label: 'Icône actuelle' }, ...CATEGORY_ICONS];

  const replacement = siblings.find((item) => item.id === replacementId) ?? null;
  const replacementRequired = usage !== undefined && needsReplacement(usage);
  const summary = usage ? deletionSummary(usage, replacement?.name ?? null) : null;

  function handleSave() {
    if (nameError !== undefined) {
      setErrorText(nameError);
      return;
    }
    setErrorText(undefined);
    updateCategory.mutate(
      { id: category.id, patch: { name: normalized, icon } },
      {
        onSuccess: () => {
          toast.show('Catégorie enregistrée');
          onDone();
        },
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  function handleDelete() {
    if (usage === undefined || (replacementRequired && replacement === null)) {
      return;
    }
    setErrorText(undefined);
    deleteCategory.mutate(
      { id: category.id, replacementId: replacementRequired ? replacement?.id ?? null : null },
      {
        onSuccess: () => {
          toast.show(`Catégorie « ${category.name} » supprimée`, 'info');
          onDone();
        },
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  return (
    <>
      <TextField
        label="Nom"
        value={name}
        onChangeText={setName}
        errorText={normalized !== category.name ? nameError : undefined}
        // Borne de saisie seulement : le contrôle qui compte en points de code est validateCategoryName().
        maxLength={CATEGORY_NAME_MAX_LENGTH + 5}
        autoCapitalize="sentences"
      />

      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Icône</Text>
        <IconChoiceGrid
          options={iconOptions}
          selected={icon}
          onSelect={setIcon}
          accessibilityLabel="Icône de la catégorie"
        />
      </View>

      {errorText && !deleting ? (
        <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.danger }]}>
          {errorText}
        </Text>
      ) : null}

      <PrimaryAction
        label="Enregistrer"
        loading={updateCategory.isPending}
        disabled={busy || !changed}
        onPress={handleSave}
      />

      <View style={[styles.deleteZone, { borderColor: colors.border }]}>
        {!deleting ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setErrorText(undefined);
              setDeleting(true);
            }}
            style={styles.deleteLink}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
            <Text style={[styles.deleteLabel, { color: colors.danger }]}>Supprimer cette catégorie</Text>
          </Pressable>
        ) : usage === undefined ? (
          // Sans le compte, impossible de dire ce que la suppression emporte : on attend plutôt que de supprimer à l'aveugle.
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Text style={[styles.deleteTitle, { color: colors.text }]} accessibilityRole="header">
              Supprimer « {category.name} »
            </Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>{usageLabel(usage)}.</Text>

            {replacementRequired ? (
              <View style={styles.field}>
                <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Reporter sur</Text>
                <CategoryPicker categories={siblings} selectedId={replacementId} onSelect={setReplacementId} />
              </View>
            ) : null}

            {summary ? (
              <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.text }]}>
                {summary}
              </Text>
            ) : null}

            {errorText ? (
              <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.danger }]}>
                {errorText}
              </Text>
            ) : null}

            <DeleteAction
              label="Supprimer la catégorie"
              confirmAccessibilityLabel={`Confirmer la suppression de la catégorie ${category.name}`}
              deleting={deleteCategory.isPending}
              disabled={busy || (replacementRequired && replacement === null)}
              onConfirm={handleDelete}
            />
            <Button
              title="Garder la catégorie"
              variant="ghost"
              disabled={deleteCategory.isPending}
              onPress={() => {
                setDeleting(false);
                setReplacementId(null);
                setErrorText(undefined);
              }}
            />
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    alignItems: 'center',
  },
  header: {
    ...contentColumn,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingHorizontal: CONTENT_GUTTER + spacing.xs,
  },
  title: {
    flexShrink: 1,
    fontFamily: font.black,
    fontSize: 24,
    letterSpacing: -0.6,
  },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    alignSelf: 'stretch',
  },
  scrollContent: {
    ...contentColumn,
    gap: spacing.lg,
    paddingHorizontal: CONTENT_GUTTER,
    paddingVertical: spacing.lg,
  },
  field: {
    gap: spacing.sm,
  },
  eyebrow: {
    fontFamily: font.semibold,
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 21,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 15,
  },
  deleteZone: {
    gap: spacing.sm + 2,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  deleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  deleteLabel: {
    fontFamily: font.semibold,
    fontSize: 17,
  },
  deleteTitle: {
    fontFamily: font.bold,
    fontSize: 18,
  },
  placeholder: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorTitle: {
    fontFamily: font.medium,
    fontSize: 17,
    textAlign: 'center',
  },
});
