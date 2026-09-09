import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AmountInput } from '@/components/transaction/amount-input';
import { CategoryPicker } from '@/components/transaction/category-picker';
import { Button } from '@/components/ui/button';
import type { Category } from '@/data/categories';
import { parseAmount } from '@/lib/money';
import { font, spacing, useColors } from '@/theme/tokens';

export type BudgetFormValues = {
  categoryId: string;
  amount: number;
};

type BudgetFormProps = {
  /** Catégories proposées : à la création, celles sans budget, les plus dépensées d'abord. */
  availableCategories: Category[];
  initialValues?: BudgetFormValues;
  /** En édition, la catégorie ne se choisit plus : on affiche seulement son nom. */
  lockedCategory?: { id: string; name: string };
  submitLabel: string;
  submitting: boolean;
  deleting: boolean;
  errorText?: string;
  onSubmit: (values: BudgetFormValues) => void;
  onDelete?: () => void;
};

export function BudgetForm({
  availableCategories,
  initialValues,
  lockedCategory,
  submitLabel,
  submitting,
  deleting,
  errorText,
  onSubmit,
  onDelete,
}: BudgetFormProps) {
  const colors = useColors();

  const [categoryId, setCategoryId] = useState<string | null>(
    lockedCategory?.id ?? initialValues?.categoryId ?? null
  );
  const [amountText, setAmountText] = useState(
    initialValues ? initialValues.amount.toFixed(2).replace('.', ',') : ''
  );
  const [touched, setTouched] = useState(false);

  const amount = parseAmount(amountText);
  // `amount > 0` est une contrainte de la base : la refuser ici évite un
  // aller-retour réseau pour apprendre ce qu'on sait déjà.
  const valid = categoryId !== null && amount !== null && amount > 0;

  function handleSubmit() {
    setTouched(true);
    if (!valid) {
      return;
    }
    onSubmit({ categoryId: categoryId as string, amount: amount as number });
  }

  return (
    <View style={styles.form}>
      <AmountInput value={amountText} onChangeText={setAmountText} autoFocus />

      {lockedCategory ? (
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Catégorie</Text>
          <Text style={[styles.locked, { color: colors.text }]}>{lockedCategory.name}</Text>
          {/* Déplacer un budget d’une catégorie à l’autre reviendrait à en
              supprimer un et à en créer un autre, et buterait sur l’unicité si
              la cible en a déjà un. Supprimer puis recréer est explicite. */}
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Pour changer de catégorie, supprimez ce budget et créez-en un autre.
          </Text>
        </View>
      ) : (
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Catégorie</Text>
          {availableCategories.length === 0 ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              Toutes les catégories de dépense ont déjà un budget.
            </Text>
          ) : (
            <CategoryPicker
              categories={availableCategories}
              selectedId={categoryId}
              onSelect={setCategoryId}
            />
          )}
        </View>
      )}

      {touched && !valid ? (
        <Text style={[styles.error, { color: colors.danger }]}>
          Choisissez une catégorie et un montant supérieur à zéro.
        </Text>
      ) : null}

      {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

      <Button title={submitLabel} onPress={handleSubmit} loading={submitting} />

      {onDelete ? (
        <Button title="Supprimer" variant="ghost" onPress={onDelete} loading={deleting} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  block: {
    gap: spacing.sm,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 10.5,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
  },
  locked: {
    fontFamily: font.semibold,
    fontSize: 15,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 13,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 13,
  },
});
