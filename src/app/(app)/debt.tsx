import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AmountInput } from '@/components/transaction/amount-input';
import { DateField } from '@/components/transaction/date-field';
import { Button } from '@/components/ui/button';
import { DeleteAction, PrimaryAction } from '@/components/ui/form-actions';
import { CONTENT_GUTTER, contentColumn } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SheetScrollView } from '@/components/ui/sheet-scroll-view';
import { TextField } from '@/components/ui/text-field';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useDebtMutations } from '@/hooks/use-debt-mutations';
import { useDebts } from '@/hooks/use-debts';
import { useSheetMaxHeight } from '@/hooks/use-sheet-max-height';
import { useToast } from '@/hooks/use-toast';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatOccurredOn, isoToDate, todayIso } from '@/lib/dates';
import { formatMoney, parseAmount, toAmountInput } from '@/lib/money';
import { goBackOr } from '@/lib/navigation';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';
import type { DebtDirection } from '@/types/database';

/**
 * Un prêt ou une dette : création sans paramètre, suivi avec ?id=.
 *
 * En suivi, la feuille s'ouvre sur le remboursement, pré-rempli avec ce qui reste dû : solder d'un geste est le cas courant, et un remboursement partiel se corrige dans le même champ.
 */
export default function DebtScreen() {
  const colors = useColors();
  const router = useRouter();
  const sheetMaxHeight = useSheetMaxHeight();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { debts, isLoading } = useDebts();
  const existing = typeof id === 'string' ? debts.find((debt) => debt.id === id) : undefined;

  function close() {
    goBackOr(router, '/debts');
  }

  if (typeof id === 'string' && isLoading) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Supprimée entre-temps par un autre membre, ou lien périmé.
  if (typeof id === 'string' && !existing) {
    return (
      <View style={styles.placeholder}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>Cette dette n’existe plus.</Text>
        <Button title="Retour" variant="ghost" onPress={close} />
      </View>
    );
  }

  const title = existing
    ? existing.direction === 'lent'
      ? `Prêt à ${existing.counterparty}`
      : `Emprunt à ${existing.counterparty}`
    : 'Nouveau prêt ou dette';

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background, maxHeight: sheetMaxHeight }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" numberOfLines={2}>
          {title}
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
        {existing ? <PaymentForm debtId={existing.id} onDone={close} /> : <CreateForm onDone={close} />}
      </SheetScrollView>
    </View>
  );
}

/** Création : le sens, la personne, le montant, puis l'échéance et la note, facultatives. */
function CreateForm({ onDone }: { onDone: () => void }) {
  const colors = useColors();
  const elevation = useElevation();
  const toast = useToast();
  const { activeGroupId } = useActiveGroup();
  const { create } = useDebtMutations();

  const [direction, setDirection] = useState<DebtDirection>('lent');
  const [counterparty, setCounterparty] = useState('');
  const [amountText, setAmountText] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [errorText, setErrorText] = useState<string>();
  // Tirés une fois par feuille : un second « Enregistrer » après un échec réseau renvoie la même création, que la base reconnaît.
  const [ids] = useState(() => ({ debt: randomUUID(), transaction: randomUUID() }));

  const amount = parseAmount(amountText);
  const name = counterparty.trim();
  const nameError = touched && name === '' ? 'Indiquez la personne.' : undefined;
  const amountError = touched && amount === null ? 'Montant invalide.' : undefined;

  function handleSubmit() {
    setTouched(true);
    if (name === '' || amount === null || !activeGroupId) {
      return;
    }
    setErrorText(undefined);
    create.mutate(
      {
        id: ids.debt,
        groupId: activeGroupId,
        direction,
        counterparty: name,
        amount,
        dueOn,
        note: note.trim() === '' ? null : note.trim(),
        occurredOn,
        transactionId: ids.transaction,
      },
      {
        onSuccess: () => {
          toast.show(
            direction === 'lent'
              ? `Prêt de ${formatMoney(amount)} à ${name} enregistré`
              : `Emprunt de ${formatMoney(amount)} à ${name} enregistré`
          );
          onDone();
        },
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  return (
    <>
      <SegmentedControl<DebtDirection>
        options={[
          { value: 'lent', label: 'J’ai prêté', icon: 'arrow-top-right' },
          { value: 'borrowed', label: 'J’ai emprunté', icon: 'arrow-bottom-left' },
        ]}
        value={direction}
        onChange={setDirection}
      />
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        {direction === 'lent'
          ? 'Le montant sort du solde aujourd’hui, et y revient à chaque remboursement.'
          : 'Le montant entre au solde aujourd’hui, et en sort à chaque remboursement.'}
      </Text>

      <TextField
        label={direction === 'lent' ? 'À qui ?' : 'Auprès de qui ?'}
        value={counterparty}
        onChangeText={setCounterparty}
        errorText={nameError}
        placeholder="Ex : Paul, tante Awa, la boutique"
        autoCapitalize="words"
        maxLength={60}
      />

      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Montant</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }, elevation.card]}>
          <AmountInput value={amountText} onChangeText={setAmountText} />
        </View>
        {amountError ? (
          <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.danger }]}>
            {amountError}
          </Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
          {direction === 'lent' ? 'Date du prêt' : 'Date de l’emprunt'}
        </Text>
        <DateField
          value={occurredOn}
          label={formatOccurredOn(occurredOn)}
          onChange={setOccurredOn}
          maximumDate={new Date()}
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Échéance (facultatif)</Text>
        {dueOn ? (
          <>
            <DateField
              value={dueOn}
              label={formatOccurredOn(dueOn)}
              onChange={setDueOn}
              minimumDate={isoToDate(occurredOn)}
            />
            <Button title="Retirer l’échéance" variant="ghost" onPress={() => setDueOn(null)} />
          </>
        ) : (
          <Button title="Fixer une date de remboursement" variant="ghost" onPress={() => setDueOn(occurredOn)} />
        )}
      </View>

      <TextField
        label="Note (facultatif)"
        value={note}
        onChangeText={setNote}
        placeholder="Ex : pour la rentrée scolaire"
        maxLength={120}
      />

      {errorText ? (
        <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.danger }]}>
          {errorText}
        </Text>
      ) : null}

      <PrimaryAction label="Enregistrer" loading={create.isPending} onPress={handleSubmit} />
    </>
  );
}

/** Suivi : ce qui reste, un remboursement, et la suppression d'une dette saisie par erreur. */
function PaymentForm({ debtId, onDone }: { debtId: string; onDone: () => void }) {
  const colors = useColors();
  const elevation = useElevation();
  const toast = useToast();
  const { debts } = useDebts();
  const { pay, remove } = useDebtMutations();
  const debt = debts.find((candidate) => candidate.id === debtId);

  const [amountText, setAmountText] = useState<string | null>(null);
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [errorText, setErrorText] = useState<string>();
  const [transactionId] = useState(randomUUID);

  if (!debt) {
    return null;
  }

  const settled = debt.remaining === 0;
  // Pré-rempli avec le reste : solder d'un geste est le cas courant.
  const shownAmount = amountText ?? toAmountInput(debt.remaining);
  const amount = parseAmount(shownAmount);
  const busy = pay.isPending || remove.isPending;

  function handlePay() {
    if (!debt || amount === null) {
      setErrorText('Montant invalide.');
      return;
    }
    if (amount > debt.remaining) {
      setErrorText(`Le reste dû est de ${formatMoney(debt.remaining)}.`);
      return;
    }
    setErrorText(undefined);
    pay.mutate(
      { debtId: debt.id, amount, occurredOn, transactionId },
      {
        onSuccess: () => {
          toast.show(
            amount === debt.remaining
              ? `${debt.counterparty} : dette soldée`
              : `Remboursement de ${formatMoney(amount)} enregistré`
          );
          onDone();
        },
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  function handleDelete() {
    if (!debt) {
      return;
    }
    remove.mutate(debt.id, {
      onSuccess: () => {
        toast.show('Dette supprimée', 'info');
        onDone();
      },
      onError: (error) => setErrorText(dataErrorMessage(error)),
    });
  }

  return (
    <>
      <View style={[styles.status, { backgroundColor: colors.surface }, elevation.card]}>
        <Text style={[styles.statusMain, { color: colors.text }]}>
          {settled ? 'Soldé' : `Reste ${formatMoney(debt.remaining)}`}
        </Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {formatMoney(debt.paid)} remboursés sur {formatMoney(debt.amount)}
          {debt.dueOn ? ` · échéance ${formatOccurredOn(debt.dueOn)}` : ''}
        </Text>
        {debt.note ? <Text style={[styles.hint, { color: colors.textMuted }]}>{debt.note}</Text> : null}
      </View>

      {settled ? null : (
        <>
          <View style={styles.field}>
            <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
              {debt.direction === 'lent' ? 'Remboursement reçu' : 'Remboursement versé'}
            </Text>
            <View style={[styles.card, { backgroundColor: colors.surface }, elevation.card]}>
              <AmountInput value={shownAmount} onChangeText={setAmountText} />
            </View>
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

          {errorText ? (
            <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.danger }]}>
              {errorText}
            </Text>
          ) : null}

          <PrimaryAction
            label="Enregistrer le remboursement"
            loading={pay.isPending}
            disabled={busy}
            onPress={handlePay}
          />
        </>
      )}

      <DeleteAction
        label="Supprimer cette dette"
        confirmAccessibilityLabel="Confirmer la suppression de la dette et de ses mouvements"
        deleting={remove.isPending}
        disabled={busy}
        onConfirm={handleDelete}
      />
      <Text style={[styles.hint, styles.centered, { color: colors.textMuted }]}>
        Pour une saisie erronée : la dette et tous ses mouvements quittent le solde.
      </Text>
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
  card: {
    padding: spacing.sm,
    borderRadius: radius.lg,
  },
  status: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  statusMain: {
    fontFamily: font.bold,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
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
  centered: {
    textAlign: 'center',
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
