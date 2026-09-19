import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AmountInput } from '@/components/transaction/amount-input';
import { PrimaryAction } from '@/components/ui/form-actions';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { formatAmount, parseAmount, previewSum } from '@/lib/money';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export type AdjustMode = 'add' | 'remove';

/**
 * Ajoute à un montant ou en retire, sans jamais le réécrire : verser sur un objectif d'épargne, augmenter ou réduire un plafond d'enveloppe.
 *
 * On saisit l'écart, pas le résultat. Le calcul qui fait foi a lieu en base, dans un seul update (add_to_savings_goal, adjust_budget_amount) ; l'aperçu « Nouveau total » n'est là que pour dire ce que l'enregistrement va produire.
 */
export function AmountAdjuster({
  options,
  current,
  minimumAfter,
  amountLabel,
  previewLabel,
  previewDetail,
  submitLabel,
  tooLowMessage,
  submitting,
  errorText,
  onSubmit,
}: {
  options: Record<AdjustMode, { label: string; icon: IconName }>;
  current: number;
  /** Plus petite valeur acceptée après un retrait : 0 pour une épargne, 0,01 pour un plafond, qui reste positif. */
  minimumAfter: number;
  amountLabel: (mode: AdjustMode) => string;
  previewLabel: string;
  /** Complément de l'aperçu, par exemple la cible ou le seuil d'alerte qui en découle. */
  previewDetail?: (next: number) => string | null;
  submitLabel: (mode: AdjustMode) => string;
  tooLowMessage: string;
  submitting: boolean;
  errorText?: string;
  onSubmit: (delta: number) => void;
}) {
  const colors = useColors();
  const elevation = useElevation();
  const [mode, setMode] = useState<AdjustMode>('add');
  const [amountText, setAmountText] = useState('');
  const [touched, setTouched] = useState(false);

  const amount = parseAmount(amountText);
  const delta = amount === null ? null : mode === 'add' ? amount : -amount;
  const next = delta === null ? null : previewSum(current, delta);
  const tooLow = next !== null && next < minimumAfter;

  function handleSubmit() {
    setTouched(true);
    if (delta === null || tooLow) {
      return;
    }
    onSubmit(delta);
  }

  const detail = next !== null && !tooLow ? previewDetail?.(next) : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }, elevation.card]}>
      <SegmentedControl
        options={[
          { value: 'add', ...options.add },
          { value: 'remove', ...options.remove },
        ]}
        value={mode}
        onChange={setMode}
      />

      <Text style={[styles.amountLabel, { color: colors.textMuted }]}>{amountLabel(mode)}</Text>
      <AmountInput value={amountText} onChangeText={setAmountText} autoFocus />

      {tooLow ? (
        <Text style={[styles.message, { color: colors.danger }]}>{tooLowMessage}</Text>
      ) : touched && delta === null ? (
        <Text style={[styles.message, { color: colors.danger }]}>
          Saisissez un montant supérieur à zéro.
        </Text>
      ) : (
        // Toujours présent, même vide : l'aperçu apparaît à la première frappe sans faire sauter le bouton en dessous.
        <View style={[styles.preview, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.previewLabel, { color: colors.textMuted }]}>{previewLabel}</Text>
          <Text style={[styles.previewValue, { color: colors.text }]}>
            {formatAmount(next ?? current)} €
          </Text>
          {detail ? (
            <Text style={[styles.previewDetail, { color: colors.textMuted }]}>{detail}</Text>
          ) : null}
        </View>
      )}

      {errorText ? <Text style={[styles.message, { color: colors.danger }]}>{errorText}</Text> : null}

      <PrimaryAction
        label={submitLabel(mode)}
        icon={mode === 'add' ? 'plus' : 'minus'}
        loading={submitting}
        onPress={handleSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm + 2,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  amountLabel: {
    fontFamily: font.medium,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  preview: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  previewLabel: {
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  previewValue: {
    fontFamily: font.bold,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  previewDetail: {
    fontFamily: font.regular,
    fontSize: 12.5,
    textAlign: 'center',
  },
  message: {
    fontFamily: font.medium,
    fontSize: 13,
    textAlign: 'center',
  },
});
