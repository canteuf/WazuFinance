import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AmountInput } from '@/components/transaction/amount-input';
import { CategoryPicker } from '@/components/transaction/category-picker';
import { Button } from '@/components/ui/button';
import { useCategories } from '@/hooks/use-categories';
import { readLastCategory } from '@/lib/last-used';
import { parseAmount } from '@/lib/money';
import { radius, spacing, useColors } from '@/theme/tokens';
import type { TransactionType } from '@/types/database';

export type TransactionFormValues = {
  type: TransactionType;
  amount: number;
  categoryId: string;
  occurredOn: string;
  note: string | null;
};

type TransactionFormProps = {
  groupId: string;
  initialValues?: TransactionFormValues;
  submitLabel: string;
  submitting: boolean;
  errorText?: string;
  onSubmit: (values: TransactionFormValues) => void;
  onDelete?: () => void;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Formulaire partagé entre création et édition.
 *
 * Les valeurs par défaut de la spec 4.3 sont posées ici : type dépense, date
 * du jour, et catégorie pré-remplie avec la dernière utilisée dans ce groupe.
 */
export function TransactionForm({
  groupId,
  initialValues,
  submitLabel,
  submitting,
  errorText,
  onSubmit,
  onDelete,
}: TransactionFormProps) {
  const colors = useColors();

  const [type, setType] = useState<TransactionType>(initialValues?.type ?? 'expense');
  const [amountText, setAmountText] = useState(
    initialValues ? initialValues.amount.toFixed(2).replace('.', ',') : ''
  );
  // Sélection brute : posée par la présélection initiale, la lecture de la
  // dernière catégorie utilisée, ou un choix explicite dans CategoryPicker.
  const [categorySelection, setCategorySelection] = useState<string | null>(
    initialValues?.categoryId ?? null
  );
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [touched, setTouched] = useState(false);
  // Deuxième étape de confirmation avant suppression, voir le bloc de rendu
  // plus bas pour la justification de ce choix.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { categories, isLoading: categoriesLoading } = useCategories(type);

  // Présélection de la dernière catégorie, uniquement en création.
  useEffect(() => {
    if (initialValues) {
      return;
    }
    let active = true;
    readLastCategory(groupId).then((lastId) => {
      if (active && lastId) {
        setCategorySelection(lastId);
      }
    });
    return () => {
      active = false;
    };
  }, [groupId, initialValues]);

  // Changer de type invalide la catégorie courante, qui appartient à l'autre
  // liste. Dérivé au rendu plutôt que synchronisé par un effet (même choix
  // que ActiveGroupProvider) : tant que categoriesLoading est vrai, la liste
  // est encore vide et ne prouve rien, donc on garde la sélection telle
  // quelle — sinon le premier rendu de l'édition effacerait la catégorie
  // pré-remplie avant même que la liste ne soit arrivée.
  const categoryId =
    categorySelection !== null &&
    !categoriesLoading &&
    !categories.some((category) => category.id === categorySelection)
      ? null
      : categorySelection;

  const amount = parseAmount(amountText);
  const amountError = touched && amount === null ? 'Montant invalide.' : undefined;
  const categoryError = touched && categoryId === null ? 'Choisissez une catégorie.' : undefined;

  function handleSubmit() {
    setTouched(true);
    if (amount === null || categoryId === null) {
      return;
    }
    onSubmit({
      type,
      amount,
      categoryId,
      occurredOn: initialValues?.occurredOn ?? today(),
      note: note.trim() === '' ? null : note.trim(),
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.segmented}>
        <Button
          title="Dépense"
          variant={type === 'expense' ? 'primary' : 'ghost'}
          onPress={() => setType('expense')}
        />
        <Button
          title="Revenu"
          variant={type === 'income' ? 'primary' : 'ghost'}
          onPress={() => setType('income')}
        />
      </View>

      <AmountInput value={amountText} onChangeText={setAmountText} autoFocus={!initialValues} />
      {amountError ? <Text style={[styles.error, { color: colors.danger }]}>{amountError}</Text> : null}

      <CategoryPicker
        categories={categories}
        selectedId={categoryId}
        onSelect={setCategorySelection}
      />
      {categoryError ? (
        <Text style={[styles.error, { color: colors.danger }]}>{categoryError}</Text>
      ) : null}

      <TextInput
        accessibilityLabel="Note"
        placeholder="Note (facultatif)"
        placeholderTextColor={colors.textMuted}
        value={note}
        onChangeText={setNote}
        style={[
          styles.note,
          { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
        ]}
      />

      {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

      <Button title={submitLabel} loading={submitting} onPress={handleSubmit} />

      {onDelete ? (
        confirmingDelete ? (
          // Confirmation portée par l'état du composant, pas par Alert.alert :
          // cette app est aussi testée dans un navigateur, où Alert.alert ne
          // fait rien — une confirmation qui en dépendrait rendrait la
          // suppression silencieusement impossible sur le web.
          <View style={styles.deleteRow}>
            <Button
              title="Confirmer la suppression"
              variant="danger"
              loading={submitting}
              disabled={submitting}
              accessibilityLabel="Confirmer la suppression définitive de cette opération"
              onPress={onDelete}
            />
            <Button
              title="Annuler"
              variant="ghost"
              disabled={submitting}
              onPress={() => setConfirmingDelete(false)}
            />
          </View>
        ) : (
          <Button
            title="Supprimer"
            variant="ghost"
            loading={submitting}
            disabled={submitting}
            onPress={() => setConfirmingDelete(true)}
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  segmented: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  deleteRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  error: {
    fontSize: 13,
  },
  note: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
});
