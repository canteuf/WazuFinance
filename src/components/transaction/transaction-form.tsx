import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AmountInput } from '@/components/transaction/amount-input';
import { CategoryPicker } from '@/components/transaction/category-picker';
import { DateField } from '@/components/transaction/date-field';
import { Button } from '@/components/ui/button';
import { CONTENT_GUTTER } from '@/components/ui/screen';
import { useCategories } from '@/hooks/use-categories';
import { useFrequentAmounts } from '@/hooks/use-frequent-amounts';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatOccurredOn, todayIso } from '@/lib/dates';
import { readLastCategory } from '@/lib/last-used';
import { formatAmount, parseAmount } from '@/lib/money';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';
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
  /** Nom du groupe où l'opération sera enregistrée, rappelé sous la note. */
  groupName: string;
  initialValues?: TransactionFormValues;
  submitLabel: string;
  /** Création ou modification en cours : fait tourner le bouton de validation. */
  submitting: boolean;
  /** Suppression en cours : fait tourner les boutons de suppression, pas celui de validation. */
  deleting: boolean;
  errorText?: string;
  onSubmit: (values: TransactionFormValues) => void;
  onDelete?: () => void;
};

/**
 * Formulaire partagé entre création et édition.
 *
 * Les valeurs par défaut de la spec 4.3 sont posées ici : type dépense, date du jour, et catégorie pré-remplie avec la dernière utilisée dans ce groupe.
 */
export function TransactionForm({
  groupId,
  groupName,
  initialValues,
  submitLabel,
  submitting,
  deleting,
  errorText,
  onSubmit,
  onDelete,
}: TransactionFormProps) {
  const colors = useColors();
  const elevation = useElevation();

  const [type, setType] = useState<TransactionType>(initialValues?.type ?? 'expense');
  // Suit le type choisi : les habitudes de dépense et de revenu n'ont rien en commun.
  const frequentAmounts = useFrequentAmounts(type);
  const [amountText, setAmountText] = useState(
    initialValues ? initialValues.amount.toFixed(2).replace('.', ',') : ''
  );
  // Sélection brute : posée par la présélection initiale, la lecture de la dernière catégorie utilisée, ou un choix explicite dans CategoryPicker.
  const [categorySelection, setCategorySelection] = useState<string | null>(
    initialValues?.categoryId ?? null
  );
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [occurredOn, setOccurredOn] = useState(initialValues?.occurredOn ?? todayIso());
  const [touched, setTouched] = useState(false);
  // Deuxième étape de confirmation avant suppression, voir le bloc de rendu plus bas pour la justification de ce choix.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { categories, isLoading: categoriesLoading, error: categoriesError } = useCategories(type);

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

  // Changer de type invalide la catégorie courante, qui appartient à l'autre liste. Dérivé au rendu plutôt que synchronisé par un effet (même choix que ActiveGroupProvider) : tant que categoriesLoading est vrai, la liste est encore vide et ne prouve rien, donc on garde la sélection telle quelle — sinon le premier rendu de l'édition effacerait la catégorie pré-remplie avant même que la liste ne soit arrivée.
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
      occurredOn,
      note: note.trim() === '' ? null : note.trim(),
    });
  }

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.surface }, elevation.card]}>
        <View style={[styles.segmented, { backgroundColor: colors.surfaceMuted }]}>
          <Segment
            label="Dépense"
            icon="trending-down"
            selected={type === 'expense'}
            onPress={() => setType('expense')}
          />
          <Segment
            label="Revenu"
            icon="trending-up"
            selected={type === 'income'}
            onPress={() => setType('income')}
          />
        </View>

        <Text style={[styles.amountLabel, { color: colors.textMuted }]}>
          {type === 'expense' ? 'Montant de la dépense' : 'Montant du revenu'}
        </Text>
        <AmountInput value={amountText} onChangeText={setAmountText} autoFocus={!initialValues} />
        {amountError ? (
          <Text style={[styles.error, styles.centered, { color: colors.danger }]}>{amountError}</Text>
        ) : null}

        {/* Absents tant que l'utilisateur n'a rien répété : des montants inventés ne correspondraient aux habitudes de personne. En création seulement — en modification, le montant existe déjà. */}
        {!initialValues && frequentAmounts.length > 0 ? (
          <View style={styles.quickRow}>
            {frequentAmounts.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={`Montant ${formatAmount(value)} euros`}
                onPress={() => setAmountText(value.toFixed(2).replace('.', ','))}
                style={[styles.quick, { backgroundColor: colors.surfaceMuted }]}
              >
                <Text style={[styles.quickLabel, { color: colors.text }]}>
                  {formatAmount(value)} €
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.field}>
        <View style={styles.fieldHead}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Catégorie</Text>
          {!initialValues ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>Dernière utilisée pré-remplie</Text>
          ) : null}
        </View>
        {categoriesError ? (
          // Sans ce message, un chargement des catégories en échec rend la grille vide sans explication : valider affiche « Choisissez une catégorie » alors qu'il n'y a rien à choisir.
          <Text style={[styles.error, { color: colors.danger }]}>
            {dataErrorMessage(categoriesError)}
          </Text>
        ) : null}
        <CategoryPicker
          categories={categories}
          selectedId={categoryId}
          onSelect={setCategorySelection}
        />
        {categoryError ? (
          <Text style={[styles.error, { color: colors.danger }]}>{categoryError}</Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Date</Text>
        <DateField
          value={occurredOn}
          label={formatOccurredOn(occurredOn)}
          onChange={setOccurredOn}
          maximumDate={new Date()}
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Commerçant ou note (facultatif)</Text>
        <View style={[styles.note, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="storefront-outline" size={20} color={colors.textMuted} />
          <TextInput
            accessibilityLabel="Commerçant ou note"
            placeholder="Ex : Boulangerie, Monoprix, SNCF…"
            placeholderTextColor={colors.textMuted}
            value={note}
            onChangeText={setNote}
            style={[styles.noteInput, { color: colors.text }]}
          />
        </View>
        {/* Dit dans quel groupe l'opération atterrit : dans un budget partagé, elle sera visible de tous ses membres. */}
        <Text style={[styles.hint, { color: colors.textMuted }]}>Enregistrée dans « {groupName} »</Text>
      </View>

      {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: deleting, busy: submitting }}
        disabled={deleting || submitting}
        onPress={handleSubmit}
        style={({ pressed }) => [
          styles.submit,
          elevation.floating,
          { backgroundColor: colors.primary, opacity: deleting ? 0.5 : pressed ? 0.85 : 1 },
        ]}
      >
        {submitting ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <>
            <MaterialCommunityIcons name="check" size={22} color={colors.primaryText} />
            <Text style={[styles.submitLabel, { color: colors.primaryText }]}>{submitLabel}</Text>
          </>
        )}
      </Pressable>

      {onDelete ? (
        confirmingDelete ? (
          // Confirmation portée par l'état du composant, pas par Alert.alert : cette app est aussi testée dans un navigateur, où Alert.alert ne fait rien — une confirmation qui en dépendrait rendrait la suppression silencieusement impossible sur le web.
          <View style={styles.deleteRow}>
            <Button
              title="Confirmer la suppression"
              variant="danger"
              loading={deleting}
              disabled={submitting || deleting}
              accessibilityLabel="Confirmer la suppression définitive de cette opération"
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
          <Pressable
            accessibilityRole="button"
            disabled={submitting || deleting}
            onPress={() => setConfirmingDelete(true)}
            style={styles.deleteLink}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
            <Text style={[styles.deleteLabel, { color: colors.danger }]}>
              Supprimer cette écriture
            </Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

/** Un côté du sélecteur Dépense / Revenu : plein et sombre quand il est choisi, comme sur la maquette. */
function Segment({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: 'trending-down' | 'trending-up';
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const foreground = selected ? colors.primaryText : colors.textMuted;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.segment, selected && { backgroundColor: colors.primary }]}
    >
      <MaterialCommunityIcons name={icon} size={18} color={foreground} />
      <Text style={[styles.segmentLabel, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
    // Gouttière partagée avec les écrans, pour que la grille de catégories tombe sur la même colonne que le contenu d'un `Screen` ; l'espacement vertical, lui, reste celui du rythme des blocs.
    paddingHorizontal: CONTENT_GUTTER,
    paddingVertical: spacing.lg,
  },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 46,
    borderRadius: radius.pill,
  },
  segmentLabel: {
    fontFamily: font.bold,
    fontSize: 17,
  },
  amountLabel: {
    fontFamily: font.medium,
    fontSize: 16,
    textAlign: 'center',
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  quick: {
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  quickLabel: {
    fontFamily: font.semibold,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  field: {
    gap: spacing.sm,
  },
  fieldHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
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
    fontSize: 14.5,
  },
  deleteRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 15,
  },
  centered: {
    textAlign: 'center',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 54,
  },
  noteInput: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 17,
    paddingVertical: spacing.sm,
  },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 60,
    borderRadius: radius.pill,
  },
  submitLabel: {
    fontFamily: font.bold,
    fontSize: 20,
  },
  deleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    alignSelf: 'center',
    paddingVertical: spacing.xs,
  },
  deleteLabel: {
    fontFamily: font.bold,
    fontSize: 17,
  },
});
