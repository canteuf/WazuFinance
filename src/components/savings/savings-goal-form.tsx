import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AmountInput } from '@/components/transaction/amount-input';
import { DateField } from '@/components/transaction/date-field';
import { Button } from '@/components/ui/button';
import { formatOccurredOn, todayIso } from '@/lib/dates';
import { parseAmount, parseNonNegativeAmount } from '@/lib/money';
import { font, radius, spacing, useColors } from '@/theme/tokens';

export type SavingsGoalFormValues = {
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
};

type SavingsGoalFormProps = {
  initialValues?: SavingsGoalFormValues;
  submitLabel: string;
  submitting: boolean;
  deleting: boolean;
  errorText?: string;
  onSubmit: (values: SavingsGoalFormValues) => void;
  onDelete?: () => void;
};

export function SavingsGoalForm({
  initialValues,
  submitLabel,
  submitting,
  deleting,
  errorText,
  onSubmit,
  onDelete,
}: SavingsGoalFormProps) {
  const colors = useColors();

  const [name, setName] = useState(initialValues?.name ?? '');
  const [targetAmountText, setTargetAmountText] = useState(
    initialValues ? initialValues.targetAmount.toFixed(2).replace('.', ',') : ''
  );
  const [currentAmountText, setCurrentAmountText] = useState(
    initialValues ? initialValues.currentAmount.toFixed(2).replace('.', ',') : '0,00'
  );
  const [hasTargetDate, setHasTargetDate] = useState(initialValues?.targetDate != null);
  const [targetDate, setTargetDate] = useState(initialValues?.targetDate ?? todayIso());
  const [touched, setTouched] = useState(false);
  // Deuxième étape de confirmation avant suppression, même motif que budget-form.tsx : pas de dépendance à Alert.alert, qui ne fait rien sur web.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const targetAmount = parseAmount(targetAmountText);
  const currentAmount = parseNonNegativeAmount(currentAmountText);
  // target_amount > 0 et current_amount >= 0 sont des contraintes de la base : les refuser ici évite un aller-retour réseau pour apprendre ce qu'on sait déjà.
  const valid = name.trim() !== '' && targetAmount !== null && currentAmount !== null;

  function handleSubmit() {
    setTouched(true);
    if (!valid) {
      return;
    }
    onSubmit({
      name: name.trim(),
      targetAmount: targetAmount as number,
      currentAmount: currentAmount as number,
      targetDate: hasTargetDate ? targetDate : null,
    });
  }

  return (
    <View style={styles.form}>
      <TextInput
        accessibilityLabel="Nom de l’objectif"
        placeholder="Vacances, voiture, urgence…"
        placeholderTextColor={colors.textMuted}
        value={name}
        onChangeText={setName}
        style={[
          styles.name,
          { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
        ]}
      />

      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Montant cible</Text>
        <AmountInput value={targetAmountText} onChangeText={setTargetAmountText} autoFocus />
      </View>

      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Montant actuel</Text>
        <AmountInput value={currentAmountText} onChangeText={setCurrentAmountText} />
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: hasTargetDate }}
        accessibilityLabel="Fixer une échéance"
        onPress={() => setHasTargetDate((value) => !value)}
        style={styles.toggleRow}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: colors.border,
              backgroundColor: hasTargetDate ? colors.primary : 'transparent',
            },
          ]}
        >
          {hasTargetDate ? (
            <Text style={[styles.checkmark, { color: colors.primaryText }]}>✓</Text>
          ) : null}
        </View>
        <Text style={[styles.toggleLabel, { color: colors.text }]}>Fixer une échéance</Text>
      </Pressable>

      {hasTargetDate ? (
        <DateField
          value={targetDate}
          label={formatOccurredOn(targetDate)}
          onChange={setTargetDate}
          minimumDate={new Date()}
        />
      ) : null}

      {touched && !valid ? (
        <Text style={[styles.error, { color: colors.danger }]}>
          Donnez un nom, un montant cible supérieur à zéro et un montant actuel positif ou nul.
        </Text>
      ) : null}

      {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

      <Button title={submitLabel} loading={submitting} disabled={deleting} onPress={handleSubmit} />

      {onDelete ? (
        confirmingDelete ? (
          <View style={styles.deleteRow}>
            <Button
              title="Confirmer la suppression"
              variant="danger"
              loading={deleting}
              disabled={submitting || deleting}
              accessibilityLabel="Confirmer la suppression définitive de cet objectif"
              onPress={onDelete}
            />
            <Button
              title="Annuler"
              variant="ghost"
              disabled={submitting || deleting}
              onPress={() => setConfirmingDelete(false)}
            />
          </View>
        ) : (
          <Button
            title="Supprimer"
            variant="ghost"
            loading={deleting}
            disabled={submitting || deleting}
            onPress={() => setConfirmingDelete(true)}
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  name: {
    fontFamily: font.semibold,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontFamily: font.bold,
    fontSize: 14,
  },
  toggleLabel: {
    fontFamily: font.medium,
    fontSize: 14,
  },
  deleteRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 13,
  },
});
