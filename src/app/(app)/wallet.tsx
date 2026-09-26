import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AmountInput } from '@/components/transaction/amount-input';
import { Button } from '@/components/ui/button';
import { DeleteAction, PrimaryAction } from '@/components/ui/form-actions';
import { CONTENT_GUTTER, contentColumn } from '@/components/ui/screen';
import { SheetScrollView } from '@/components/ui/sheet-scroll-view';
import { TextField } from '@/components/ui/text-field';
import { WALLET_KINDS } from '@/components/wallet/wallet-kinds';
import type { WalletOverview } from '@/data/wallets';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useSheetMaxHeight } from '@/hooks/use-sheet-max-height';
import { useToast } from '@/hooks/use-toast';
import { useWalletMutations } from '@/hooks/use-wallet-mutations';
import { useWallets } from '@/hooks/use-wallets';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatBalance, formatMoney, parseNonNegativeAmount, toAmountInput, withCurrency } from '@/lib/money';
import { goBackOr } from '@/lib/navigation';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';
import type { WalletKind } from '@/types/database';

/**
 * Un portefeuille : création sans paramètre, réglages avec ?id=.
 *
 * Le solde ne se saisit jamais comme une opération : à la création, c'est le point de départ ; ensuite, « Ajuster au solde réel » corrige l'écart avec ce que l'utilisateur a vraiment, sans créer de dépense ni de revenu fictifs.
 */
export default function WalletScreen() {
  const colors = useColors();
  const router = useRouter();
  const sheetMaxHeight = useSheetMaxHeight();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { wallets, isLoading } = useWallets();
  const existing = typeof id === 'string' ? wallets.find((wallet) => wallet.id === id) : undefined;

  function close() {
    goBackOr(router, '/wallets');
  }

  if (typeof id === 'string' && isLoading) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (typeof id === 'string' && !existing) {
    return (
      <View style={styles.placeholder}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>Ce portefeuille n’existe plus.</Text>
        <Button title="Retour" variant="ghost" onPress={close} />
      </View>
    );
  }

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background, maxHeight: sheetMaxHeight }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" numberOfLines={2}>
          {existing ? existing.name : 'Nouveau portefeuille'}
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
        {existing ? <EditForm wallet={existing} onDone={close} /> : <CreateForm onDone={close} />}
      </SheetScrollView>
    </View>
  );
}

function KindPicker({ value, onChange }: { value: WalletKind; onChange: (kind: WalletKind) => void }) {
  const colors = useColors();

  return (
    // Quatre tuiles égales sur une seule ligne, l'icône au-dessus du libellé : côte à côte, « Espèces » ne tenait pas dans un quart de largeur sur un téléphone de 360 dp. Le libellé rétrécit plutôt que de passer à la ligne quand la police système est agrandie.
    <View accessibilityRole="radiogroup" style={styles.kinds}>
      {WALLET_KINDS.map((kind) => {
        const selected = kind.value === value;
        return (
          <Pressable
            key={kind.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={kind.label}
            onPress={() => onChange(kind.value)}
            style={[
              styles.kind,
              {
                backgroundColor: selected ? colors.primary : colors.surface,
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={kind.icon}
              size={22}
              color={selected ? colors.primaryText : colors.textMuted}
            />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.kindLabel, { color: selected ? colors.primaryText : colors.text }]}
            >
              {kind.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const colors = useColors();
  const elevation = useElevation();
  const toast = useToast();
  const { activeGroupId } = useActiveGroup();
  const { create } = useWalletMutations();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<WalletKind>('mobile_money');
  const [balanceText, setBalanceText] = useState('');
  const [touched, setTouched] = useState(false);
  const [errorText, setErrorText] = useState<string>();
  const [walletId] = useState(randomUUID);

  const trimmed = name.trim();
  // Vide vaut zéro : un portefeuille qu'on ouvre aujourd'hui peut partir de rien.
  const opening = balanceText.trim() === '' ? 0 : parseNonNegativeAmount(balanceText);

  function handleSubmit() {
    setTouched(true);
    if (trimmed === '' || opening === null || !activeGroupId) {
      return;
    }
    setErrorText(undefined);
    create.mutate(
      { id: walletId, groupId: activeGroupId, name: trimmed, kind, openingBalance: opening },
      {
        onSuccess: () => {
          toast.show(`Portefeuille « ${trimmed} » créé`);
          onDone();
        },
        onError: (error) =>
          setErrorText(
            // 23505 : l'index wallets_unique_group_name. Le message générique de data-errors parlerait d'« enregistrement identique ».
            (error as { code?: string }).code === '23505'
              ? 'Un portefeuille porte déjà ce nom.'
              : dataErrorMessage(error)
          ),
      }
    );
  }

  return (
    <>
      <TextField
        label="Nom"
        value={name}
        onChangeText={setName}
        errorText={touched && trimmed === '' ? 'Donnez un nom au portefeuille.' : undefined}
        placeholder="Ex : MTN MoMo, Orange Money, Espèces"
        maxLength={40}
      />

      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Type</Text>
        <KindPicker value={kind} onChange={setKind} />
      </View>

      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Solde actuel</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }, elevation.card]}>
          <AmountInput value={balanceText} onChangeText={setBalanceText} />
        </View>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Ce qu’il contient aujourd’hui : l’argent en poche, ou le solde affiché par l’app de mobile
          money. C’est un point de départ, pas un revenu.
        </Text>
        {touched && opening === null ? (
          <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.danger }]}>
            Montant invalide.
          </Text>
        ) : null}
      </View>

      {errorText ? (
        <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.danger }]}>
          {errorText}
        </Text>
      ) : null}

      <PrimaryAction label="Créer le portefeuille" loading={create.isPending} onPress={handleSubmit} />
    </>
  );
}

function EditForm({ wallet, onDone }: { wallet: WalletOverview; onDone: () => void }) {
  const colors = useColors();
  const elevation = useElevation();
  const toast = useToast();
  const { update, adjust, remove } = useWalletMutations();

  const [name, setName] = useState(wallet.name);
  const [kind, setKind] = useState<WalletKind>(wallet.kind);
  const [actualText, setActualText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string>();

  const trimmed = name.trim();
  const changed = trimmed !== wallet.name || kind !== wallet.kind;
  // Pré-rempli avec le solde calculé : on n'y touche que si l'argent réel diffère. Un solde négatif (découvert) ne se saisit pas ici.
  const shownActual = actualText ?? (wallet.balance >= 0 ? toAmountInput(wallet.balance) : '');
  const actual = shownActual.trim() === '' ? null : parseNonNegativeAmount(shownActual);
  const busy = update.isPending || adjust.isPending || remove.isPending;

  function handleSave() {
    if (trimmed === '') {
      setErrorText('Donnez un nom au portefeuille.');
      return;
    }
    setErrorText(undefined);
    update.mutate(
      { id: wallet.id, patch: { name: trimmed, kind } },
      {
        onSuccess: () => {
          toast.show('Portefeuille enregistré');
          onDone();
        },
        onError: (error) =>
          setErrorText(
            (error as { code?: string }).code === '23505'
              ? 'Un portefeuille porte déjà ce nom.'
              : dataErrorMessage(error)
          ),
      }
    );
  }

  function handleAdjust() {
    if (actual === null) {
      setErrorText('Montant invalide.');
      return;
    }
    setErrorText(undefined);
    adjust.mutate(
      { id: wallet.id, actual },
      {
        onSuccess: (gap) => {
          toast.show(
            gap === 0
              ? 'Le solde était déjà juste'
              : `Solde ajusté (${gap > 0 ? '+' : '−'}${formatMoney(Math.abs(gap))})`
          );
          onDone();
        },
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  function handleDelete() {
    remove.mutate(wallet.id, {
      onSuccess: () => {
        toast.show(`Portefeuille « ${wallet.name} » supprimé`, 'info');
        onDone();
      },
      onError: (error) => setErrorText(dataErrorMessage(error)),
    });
  }

  return (
    <>
      <View style={[styles.status, { backgroundColor: colors.surface }, elevation.card]}>
        <Text style={[styles.hint, { color: colors.textMuted }]}>Solde</Text>
        <Text style={[styles.statusMain, { color: wallet.balance < 0 ? colors.danger : colors.text }]}>
          {withCurrency(formatBalance(wallet.balance))}
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Ajuster au solde réel</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }, elevation.card]}>
          <AmountInput value={shownActual} onChangeText={setActualText} />
        </View>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Comptez l’argent ou lisez le solde de l’app, et saisissez-le : l’écart corrige le point de
          départ, sans créer de dépense ni de revenu.
        </Text>
        <Button title="Ajuster le solde" variant="ghost" loading={adjust.isPending} disabled={busy} onPress={handleAdjust} />
      </View>

      <TextField label="Nom" value={name} onChangeText={setName} maxLength={40} />

      <View style={styles.field}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Type</Text>
        <KindPicker value={kind} onChange={setKind} />
      </View>

      {errorText ? (
        <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.danger }]}>
          {errorText}
        </Text>
      ) : null}

      <PrimaryAction
        label="Enregistrer"
        loading={update.isPending}
        disabled={busy || !changed}
        onPress={handleSave}
      />

      {wallet.isDefault ? (
        <Text style={[styles.hint, styles.centered, { color: colors.textMuted }]}>
          Portefeuille par défaut : il reçoit les opérations sans portefeuille et ne se supprime pas.
        </Text>
      ) : (
        <DeleteAction
          label="Supprimer ce portefeuille"
          confirmAccessibilityLabel="Confirmer la suppression du portefeuille"
          deleting={remove.isPending}
          disabled={busy}
          onConfirm={handleDelete}
        />
      )}
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
  kinds: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  kind: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 64,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  kindLabel: {
    alignSelf: 'stretch',
    textAlign: 'center',
    fontFamily: font.semibold,
    fontSize: 14,
  },
  status: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  statusMain: {
    fontFamily: font.bold,
    fontSize: 26,
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
