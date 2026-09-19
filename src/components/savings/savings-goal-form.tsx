import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DEFAULT_GOAL_ICON, GOAL_ICONS, goalIcon } from '@/components/savings/goal-icons';
import { AmountInput } from '@/components/transaction/amount-input';
import { DateField } from '@/components/transaction/date-field';
import { DeleteAction, PrimaryAction } from '@/components/ui/form-actions';
import { formatMonthYear, todayIso } from '@/lib/dates';
import { parseAmount, parseNonNegativeAmount } from '@/lib/money';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

export type SavingsGoalFormValues = {
  name: string;
  icon: string;
  targetAmount: number;
  targetDate: string | null;
  /** Déjà de côté à la création. Ignoré en modification : l'épargné ne change plus que par versement. */
  initialAmount: number;
};

type SavingsGoalFormProps = {
  /** Présentes en modification. Le montant épargné n'en fait pas partie : il ne se réécrit pas. */
  initialValues?: Omit<SavingsGoalFormValues, 'initialAmount'>;
  submitLabel: string;
  submitting: boolean;
  deleting: boolean;
  errorText?: string;
  onSubmit: (values: SavingsGoalFormValues) => void;
  onDelete?: () => void;
};

/**
 * Nom, icône, cible et échéance d'un objectif.
 *
 * À la création seulement, un champ « Déjà épargné » : on commence rarement un objectif à zéro. Ensuite, le montant n'est plus un champ du formulaire — un versement l'augmente, un retrait le diminue, depuis la carte du dessus.
 */
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
  const elevation = useElevation();
  const editing = initialValues !== undefined;

  const [name, setName] = useState(initialValues?.name ?? '');
  const [icon, setIcon] = useState(initialValues ? goalIcon(initialValues.icon) : DEFAULT_GOAL_ICON);
  const [targetAmountText, setTargetAmountText] = useState(
    initialValues ? initialValues.targetAmount.toFixed(2).replace('.', ',') : ''
  );
  const [initialAmountText, setInitialAmountText] = useState('');
  const [hasTargetDate, setHasTargetDate] = useState(initialValues?.targetDate != null);
  const [targetDate, setTargetDate] = useState(initialValues?.targetDate ?? todayIso());
  const [touched, setTouched] = useState(false);

  const targetAmount = parseAmount(targetAmountText);
  // Vide vaut zéro : le champ est facultatif.
  const initialAmount = initialAmountText.trim() === '' ? 0 : parseNonNegativeAmount(initialAmountText);
  // target_amount > 0 et current_amount >= 0 sont des contraintes de la base : les refuser ici évite un aller-retour réseau pour apprendre ce qu'on sait déjà.
  const valid = name.trim() !== '' && targetAmount !== null && initialAmount !== null;

  function handleSubmit() {
    setTouched(true);
    if (!valid) {
      return;
    }
    onSubmit({
      name: name.trim(),
      icon,
      targetAmount: targetAmount as number,
      targetDate: hasTargetDate ? targetDate : null,
      initialAmount: initialAmount as number,
    });
  }

  return (
    <View style={styles.form}>
      <View style={[styles.card, { backgroundColor: colors.surface }, elevation.card]}>
        <Text style={[styles.amountLabel, { color: colors.textMuted }]}>Montant cible</Text>
        <AmountInput value={targetAmountText} onChangeText={setTargetAmountText} autoFocus={!editing} />
      </View>

      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Nom de l’objectif</Text>
        <TextInput
          accessibilityLabel="Nom de l’objectif"
          placeholder="Vacances, voiture, fonds d’urgence…"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          style={[
            styles.input,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
          ]}
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Icône</Text>
        <View style={styles.icons}>
          {GOAL_ICONS.map((option) => {
            const selected = option.name === icon;
            return (
              <Pressable
                key={option.name}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                onPress={() => setIcon(option.name)}
                style={[
                  styles.icon,
                  { backgroundColor: selected ? colors.primary : colors.surfaceMuted },
                ]}
              >
                <MaterialCommunityIcons
                  name={option.name}
                  size={22}
                  color={selected ? colors.primaryText : colors.primary}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      {editing ? null : (
        <View style={styles.field}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Déjà épargné (facultatif)</Text>
          <View
            style={[styles.inline, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
          >
            <TextInput
              accessibilityLabel="Montant déjà épargné"
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="0,00"
              placeholderTextColor={colors.textMuted}
              value={initialAmountText}
              onChangeText={setInitialAmountText}
              style={[styles.inlineInput, { color: colors.text }]}
            />
            <Text style={[styles.currency, { color: colors.textMuted }]}>€</Text>
          </View>
        </View>
      )}

      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Échéance</Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: hasTargetDate }}
          accessibilityLabel="Fixer une échéance"
          onPress={() => setHasTargetDate((value) => !value)}
          style={styles.toggleRow}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: hasTargetDate ? colors.primary : colors.border,
                backgroundColor: hasTargetDate ? colors.primary : 'transparent',
              },
            ]}
          >
            {hasTargetDate ? (
              <MaterialCommunityIcons name="check" size={16} color={colors.primaryText} />
            ) : null}
          </View>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>
            {hasTargetDate ? 'Atteindre la cible d’ici…' : 'Sans date limite'}
          </Text>
        </Pressable>
        {hasTargetDate ? (
          <DateField
            value={targetDate}
            label={formatMonthYear(targetDate)}
            onChange={setTargetDate}
            minimumDate={new Date()}
          />
        ) : null}
      </View>

      {touched && !valid ? (
        <Text style={[styles.error, { color: colors.danger }]}>
          Donnez un nom, un montant cible supérieur à zéro et un montant déjà épargné positif ou nul.
        </Text>
      ) : null}

      {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

      <PrimaryAction
        label={submitLabel}
        loading={submitting}
        disabled={deleting}
        onPress={handleSubmit}
      />

      {onDelete ? (
        <DeleteAction
          label="Supprimer cet objectif"
          confirmAccessibilityLabel="Confirmer la suppression définitive de cet objectif"
          deleting={deleting}
          disabled={submitting}
          onConfirm={onDelete}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
  },
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  amountLabel: {
    fontFamily: font.medium,
    fontSize: 14,
    textAlign: 'center',
  },
  field: {
    gap: spacing.sm,
  },
  eyebrow: {
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  input: {
    fontFamily: font.semibold,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 54,
    fontSize: 16,
  },
  icons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 54,
  },
  inlineInput: {
    flex: 1,
    fontFamily: font.bold,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  currency: {
    fontFamily: font.bold,
    fontSize: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm - 4,
    borderWidth: StyleSheet.hairlineWidth * 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    fontFamily: font.medium,
    fontSize: 15,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 13,
  },
});
