import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CATEGORY_ICONS, DEFAULT_CATEGORY_ICON } from '@/components/transaction/category-icons';
import { Button } from '@/components/ui/button';
import { IconChoiceGrid } from '@/components/ui/icon-choice-grid';
import type { Category } from '@/data/categories';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useCategories } from '@/hooks/use-categories';
import { useCategoryMutations } from '@/hooks/use-category-mutations';
import {
  CATEGORY_NAME_MAX_LENGTH,
  normalizeCategoryName,
  validateCategoryName,
} from '@/lib/category-name';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, radius, spacing, useColors } from '@/theme/tokens';
import type { TransactionType } from '@/types/database';

type CategoryCreatorProps = {
  /** Type de la catégorie créée : celui que le formulaire affiche, pour qu'elle apparaisse dans la grille qu'on a sous les yeux. */
  type: TransactionType;
  /** Appelé avec la catégorie créée, déjà présente dans le cache du groupe : le formulaire peut la sélectionner aussitôt. */
  onCreated: (category: Category) => void;
};

/**
 * Création d'une catégorie personnalisée, sous la grille, sans quitter le formulaire.
 *
 * Replié, un simple lien : la saisie en trois appuis (montant, catégorie, valider) n'en est pas rallongée. Déplié, un nom et une icône ; la catégorie créée est sélectionnée d'office, puisqu'on la crée pour s'en servir.
 *
 * En place plutôt que dans une feuille à part : la saisie est déjà une formSheet, et une feuille ouverte par-dessus une autre n'a pas été éprouvée sur Android. Elle aurait aussi dû renvoyer la catégorie créée au formulaire resté dessous.
 */
export function CategoryCreator({ type, onCreated }: CategoryCreatorProps) {
  const colors = useColors();
  const { activeGroupId } = useActiveGroup();
  // Toutes les catégories du type, pas seulement celles que la grille propose : le formulaire d'enveloppe masque les catégories déjà budgétées, qui restent des homonymes pour la base.
  const { categories } = useCategories(type);
  const { createCategory } = useCategoryMutations();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(DEFAULT_CATEGORY_ICON);
  const [touched, setTouched] = useState(false);
  const [errorText, setErrorText] = useState<string>();

  const normalized = normalizeCategoryName(name);
  const nameError = touched ? validateCategoryName(normalized, categories) : undefined;

  function close() {
    setOpen(false);
    setName('');
    setIcon(DEFAULT_CATEGORY_ICON);
    setTouched(false);
    setErrorText(undefined);
    createCategory.reset();
  }

  function handleCreate() {
    setTouched(true);
    setErrorText(undefined);
    if (activeGroupId === null || validateCategoryName(normalized, categories) !== undefined) {
      return;
    }
    createCategory.mutate(
      { groupId: activeGroupId, name: normalized, icon, type },
      {
        onSuccess: (created) => {
          close();
          onCreated(created);
        },
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Créer une catégorie de ${type === 'expense' ? 'dépense' : 'revenu'}`}
        onPress={() => setOpen(true)}
        hitSlop={spacing.xs}
        style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
      >
        <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.primary} />
        <Text style={[styles.linkLabel, { color: colors.primary }]}>Nouvelle catégorie</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        {type === 'expense' ? 'Nouvelle catégorie de dépense' : 'Nouvelle catégorie de revenu'}
      </Text>

      <TextInput
        accessibilityLabel="Nom de la catégorie"
        placeholder={type === 'expense' ? 'Ex : Animaux, Sport, Enfants…' : 'Ex : Loyer perçu, Prime…'}
        placeholderTextColor={colors.textMuted}
        value={name}
        onChangeText={setName}
        // Borne de saisie seulement : le contrôle qui compte en points de code est validateCategoryName().
        maxLength={CATEGORY_NAME_MAX_LENGTH + 5}
        autoFocus
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={handleCreate}
        style={[
          styles.input,
          {
            backgroundColor: colors.surfaceMuted,
            borderColor: nameError ? colors.danger : colors.border,
            color: colors.text,
          },
        ]}
      />
      {nameError ? <Text style={[styles.error, { color: colors.danger }]}>{nameError}</Text> : null}

      <IconChoiceGrid
        options={CATEGORY_ICONS}
        selected={icon}
        onSelect={setIcon}
        accessibilityLabel="Icône de la catégorie"
      />

      {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

      <View style={styles.actions}>
        <Button
          title="Créer"
          loading={createCategory.isPending}
          onPress={handleCreate}
        />
        <Button
          title="Annuler"
          variant="ghost"
          disabled={createCategory.isPending}
          onPress={close}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  linkLabel: {
    fontFamily: font.bold,
    fontSize: 16,
  },
  panel: {
    gap: spacing.sm + 2,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 17,
  },
  input: {
    fontFamily: font.semibold,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 54,
    fontSize: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 15,
  },
});
