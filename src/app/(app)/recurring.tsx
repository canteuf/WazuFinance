import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { recurringTitle } from '@/components/dashboard/due-recurring';
import { AmountInput } from '@/components/transaction/amount-input';
import { DateField } from '@/components/transaction/date-field';
import { Button } from '@/components/ui/button';
import { DeleteAction, PrimaryAction } from '@/components/ui/form-actions';
import { CONTENT_GUTTER, contentColumn } from '@/components/ui/screen';
import { SheetScrollView } from '@/components/ui/sheet-scroll-view';
import { WalletPicker } from '@/components/wallet/wallet-picker';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useRecurring } from '@/hooks/use-recurring';
import { useRecurringMutations } from '@/hooks/use-recurring-mutations';
import { useSheetMaxHeight } from '@/hooks/use-sheet-max-height';
import { useToast } from '@/hooks/use-toast';
import { useWalletChoice } from '@/hooks/use-wallet-choice';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatOccurredOn, todayIso } from '@/lib/dates';
import { formatMoney, parseAmount, toAmountInput } from '@/lib/money';
import { goBackOr } from '@/lib/navigation';
import { describeRecurrence } from '@/lib/recurrence';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

/**
 * Une opération récurrente : enregistrer sa prochaine échéance avec un montant et une date ajustés, la passer, ou supprimer la répétition.
 *
 * Le montant saisi ici ne vaut que pour cette fois : une facture d'électricité varie, le modèle garde son montant habituel. Changer le rythme ne se fait pas ici : on supprime la répétition et on en crée une autre depuis la saisie.
 */
export default function RecurringScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const router = useRouter();
  const sheetMaxHeight = useSheetMaxHeight();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { recurring, isLoading } = useRecurring();
  const { confirm, skip, remove } = useRecurringMutations();

  const item = recurring.find((candidate) => candidate.id === id);
  const { activeGroupId } = useActiveGroup();
  // Présélectionné sur le portefeuille retenu par le modèle ; en changer ne vaut que pour cette échéance.
  const wallet = useWalletChoice(activeGroupId, item?.wallet_id ?? null);

  const [amountText, setAmountText] = useState<string | null>(null);
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [errorText, setErrorText] = useState<string>();
  // Tiré une fois par feuille : un second « Enregistrer » après un échec réseau renvoie la même confirmation, que la base reconnaît au lieu de créer un doublon.
  const [transactionId] = useState(randomUUID);

  function close() {
    goBackOr(router, '/');
  }

  if (isLoading) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Supprimée entre-temps par un autre membre, ou lien périmé.
  if (!item) {
    return (
      <View style={styles.placeholder}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          Cette opération récurrente n’existe plus.
        </Text>
        <Button title="Retour" variant="ghost" onPress={close} />
      </View>
    );
  }

  const title = recurringTitle(item);
  // Le champ part du montant du modèle ; `null` tant que l'utilisateur n'y a pas touché.
  const shownAmount = amountText ?? toAmountInput(Number(item.amount));
  const amount = parseAmount(shownAmount);
  const busy = confirm.isPending || skip.isPending || remove.isPending;

  function handleConfirm() {
    if (!item || amount === null) {
      setErrorText('Montant invalide.');
      return;
    }
    setErrorText(undefined);
    confirm.mutate(
      {
        id: item.id,
        dueOn: item.next_due_on,
        transactionId,
        // `null` quand le montant n'a pas changé : la base reprend celui du modèle.
        amount: amount === Number(item.amount) ? null : amount,
        occurredOn,
        walletId: wallet.walletId,
      },
      {
        onSuccess: () => {
          toast.show(`Échéance « ${title} » enregistrée`);
          close();
        },
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  function handleSkip() {
    if (!item) {
      return;
    }
    setErrorText(undefined);
    skip.mutate(
      { id: item.id, dueOn: item.next_due_on },
      {
        onSuccess: () => {
          toast.show(`Échéance « ${title} » passée`, 'info');
          close();
        },
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  function handleDelete() {
    if (!item) {
      return;
    }
    remove.mutate(item.id, {
      onSuccess: () => {
        toast.show(`Répétition « ${title} » supprimée`, 'info');
        close();
      },
      onError: (error) => setErrorText(dataErrorMessage(error)),
    });
  }

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
        // Même raison que sur la saisie : sans défilement imbriqué, la feuille Android capte le glissement vers le bas.
        nestedScrollEnabled
      >
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {describeRecurrence(item.frequency, item.anchor_day)} · {item.type === 'income' ? 'revenu' : 'dépense'} de{' '}
          {formatMoney(Number(item.amount))}
        </Text>

        <View style={styles.field}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
            Échéance du {formatOccurredOn(item.next_due_on)}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface }, elevation.card]}>
            <AmountInput value={shownAmount} onChangeText={setAmountText} />
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Le montant saisi ne vaut que pour cette échéance.
          </Text>
        </View>

        {wallet.showPicker ? (
          <View style={styles.field}>
            <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
              {item.type === 'expense' ? 'Payé avec' : 'Reçu sur'}
            </Text>
            <WalletPicker wallets={wallet.wallets} selectedId={wallet.selectedId} onSelect={wallet.select} />
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Date de l’opération</Text>
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
          label="Enregistrer cette échéance"
          loading={confirm.isPending}
          disabled={busy}
          onPress={handleConfirm}
        />
        <Button
          title="Passer cette échéance"
          variant="ghost"
          loading={skip.isPending}
          disabled={busy}
          onPress={handleSkip}
        />

        <DeleteAction
          label="Supprimer la répétition"
          confirmAccessibilityLabel="Confirmer la suppression de la répétition. Les opérations déjà enregistrées restent."
          deleting={remove.isPending}
          disabled={busy}
          onConfirm={handleDelete}
        />
        <Text style={[styles.hint, styles.centered, { color: colors.textMuted }]}>
          Supprimer la répétition ne touche pas aux opérations déjà enregistrées.
        </Text>
      </SheetScrollView>
    </View>
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
