import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AmountInput } from '@/components/transaction/amount-input';
import { CategoryCreator } from '@/components/transaction/category-creator';
import { CategoryPicker } from '@/components/transaction/category-picker';
import { PrimaryAction } from '@/components/ui/form-actions';
import type { Category } from '@/data/categories';
import { WARNING_RATIO } from '@/lib/budget-progress';
import { formatMoney, parseAmount } from '@/lib/money';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

export type BudgetFormValues = {
  categoryId: string;
  amount: number;
};

type BudgetFormProps = {
  /** Catégories proposées : celles sans budget, les plus dépensées d'abord. */
  availableCategories: Category[];
  submitting: boolean;
  errorText?: string;
  onSubmit: (values: BudgetFormValues) => void;
};

/**
 * Création d'une enveloppe, d'après le panneau « Définir un plafond budgétaire » de la maquette `gestion_des_budgets_wazu_finance` : la catégorie, puis le plafond.
 *
 * Création seulement. Une enveloppe existante ne repasse pas par ce formulaire : son plafond s'augmente ou se réduit (voir budget.tsx), il ne se réécrit pas.
 */
export function BudgetForm({ availableCategories, submitting, errorText, onSubmit }: BudgetFormProps) {
  const colors = useColors();
  const elevation = useElevation();

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [touched, setTouched] = useState(false);

  const amount = parseAmount(amountText);
  // `amount > 0` est une contrainte de la base : la refuser ici évite un aller-retour réseau pour apprendre ce qu'on sait déjà.
  const valid = categoryId !== null && amount !== null;

  function handleSubmit() {
    setTouched(true);
    if (!valid) {
      return;
    }
    onSubmit({ categoryId: categoryId as string, amount: amount as number });
  }

  return (
    <View style={styles.form}>
      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>1. Choisir la catégorie</Text>
        {availableCategories.length === 0 ? (
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Toutes les catégories de dépense ont déjà une enveloppe.
          </Text>
        ) : (
          <CategoryPicker
            categories={availableCategories}
            selectedId={categoryId}
            onSelect={setCategoryId}
          />
        )}
        {/* Une enveloppe se pose sur une dépense : la catégorie créée ici en est une, et elle est choisie d'office. */}
        <CategoryCreator type="expense" onCreated={(category) => setCategoryId(category.id)} />
      </View>

      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>2. Plafond de la période</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }, elevation.card]}>
          <AmountInput value={amountText} onChangeText={setAmountText} />
        </View>
        {/* Une multiplication pour l'affichage, pas une somme : le seuil que budgetProgress() appliquera au même plafond. */}
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {amount !== null
            ? `L’alerte s’affichera à ${Math.round(WARNING_RATIO * 100)} % du plafond, soit ${formatMoney(amount * WARNING_RATIO)}.`
            : `L’alerte s’affichera à ${Math.round(WARNING_RATIO * 100)} % du plafond.`}
        </Text>
      </View>

      {touched && !valid ? (
        <Text style={[styles.error, { color: colors.danger }]}>
          Choisissez une catégorie et un plafond supérieur à zéro.
        </Text>
      ) : null}

      {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

      <PrimaryAction label="Enregistrer l’enveloppe" loading={submitting} onPress={handleSubmit} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
  },
  field: {
    gap: spacing.sm,
  },
  eyebrow: {
    fontFamily: font.semibold,
    fontSize: 14,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  card: {
    padding: spacing.sm,
    borderRadius: radius.lg,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 15,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 15,
  },
});
