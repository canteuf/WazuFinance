import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AmountInput } from '@/components/transaction/amount-input';
import { DateField } from '@/components/transaction/date-field';
import { PrimaryAction } from '@/components/ui/form-actions';
import { CONTENT_GUTTER, contentColumn } from '@/components/ui/screen';
import { SheetScrollView } from '@/components/ui/sheet-scroll-view';
import { TextField } from '@/components/ui/text-field';
import { WalletPicker } from '@/components/wallet/wallet-picker';
import { useSheetMaxHeight } from '@/hooks/use-sheet-max-height';
import { useToast } from '@/hooks/use-toast';
import { useWalletMutations } from '@/hooks/use-wallet-mutations';
import { useWallets } from '@/hooks/use-wallets';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatOccurredOn, todayIso } from '@/lib/dates';
import { formatMoney, parseAmount, parseNonNegativeAmount } from '@/lib/money';
import { goBackOr } from '@/lib/navigation';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

/**
 * Transfert entre deux portefeuilles : retrait MoMo vers les espèces, dépôt en banque.
 *
 * Le transfert ne change pas le solde du groupe. Ses frais, s'il y en a, deviennent une dépense « Frais mobile money » sur le portefeuille d'origine : c'est ce qui permet enfin de voir ce qu'ils coûtent par mois.
 */
export default function WalletTransferScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const router = useRouter();
  const sheetMaxHeight = useSheetMaxHeight();
  const toast = useToast();
  const { wallets } = useWallets();
  const { transfer } = useWalletMutations();

  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [feeText, setFeeText] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [errorText, setErrorText] = useState<string>();
  const [ids] = useState(() => ({ transfer: randomUUID(), fee: randomUUID() }));

  // Par défaut : du deuxième portefeuille (souvent MoMo) vers le premier (le Principal, souvent les espèces). C'est le retrait, le transfert le plus courant.
  const from = fromId ?? wallets[1]?.id ?? null;
  const to = toId ?? wallets[0]?.id ?? null;
  const amount = parseAmount(amountText);
  const fee = feeText.trim() === '' ? 0 : parseNonNegativeAmount(feeText);
  const sameWallet = from !== null && from === to;

  function close() {
    goBackOr(router, '/wallets');
  }

  function handleSubmit() {
    setTouched(true);
    if (from === null || to === null || sameWallet || amount === null || fee === null) {
      return;
    }
    setErrorText(undefined);
    const toName = wallets.find((wallet) => wallet.id === to)?.name ?? '';
    transfer.mutate(
      {
        id: ids.transfer,
        fromWalletId: from,
        toWalletId: to,
        amount,
        fee,
        occurredOn,
        feeTransactionId: ids.fee,
        note: note.trim() === '' ? null : note.trim(),
      },
      {
        onSuccess: () => {
          toast.show(
            `${formatMoney(amount)} transférés vers ${toName}${fee > 0 ? ` · ${formatMoney(fee)} de frais` : ''}`
          );
          close();
        },
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background, maxHeight: sheetMaxHeight }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          Transférer
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
        <View style={styles.field}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Depuis</Text>
          <WalletPicker wallets={wallets} selectedId={from} onSelect={setFromId} />
        </View>

        <View style={styles.field}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Vers</Text>
          <WalletPicker wallets={wallets} selectedId={to} onSelect={setToId} />
          {sameWallet ? (
            <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.danger }]}>
              Choisissez deux portefeuilles différents.
            </Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Montant</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }, elevation.card]}>
            <AmountInput value={amountText} onChangeText={setAmountText} />
          </View>
          {touched && amount === null ? (
            <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.danger }]}>
              Montant invalide.
            </Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Frais (facultatif)</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }, elevation.card]}>
            <AmountInput value={feeText} onChangeText={setFeeText} />
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Comptés comme une dépense « Frais mobile money » sur le portefeuille d’origine.
          </Text>
          {touched && fee === null ? (
            <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.danger }]}>
              Frais invalides.
            </Text>
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

        <TextField
          label="Note (facultatif)"
          value={note}
          onChangeText={setNote}
          placeholder="Ex : retrait au kiosque"
          maxLength={120}
        />

        {errorText ? (
          <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.danger }]}>
            {errorText}
          </Text>
        ) : null}

        <PrimaryAction
          label="Transférer"
          icon="swap-horizontal"
          loading={transfer.isPending}
          disabled={wallets.length < 2}
          onPress={handleSubmit}
        />
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
});
