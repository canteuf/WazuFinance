import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link, useRouter } from 'expo-router';
import { Fragment } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { WALLET_KINDS, walletIcon } from '@/components/wallet/wallet-kinds';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useRecentTransfers, useWallets } from '@/hooks/use-wallets';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatOccurredOn } from '@/lib/dates';
import { formatBalance, formatMoney, spokenAmount, withCurrency } from '@/lib/money';
import { goBackOr } from '@/lib/navigation';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

/**
 * Portefeuilles du groupe actif : le solde de chacun, les derniers transferts, et les entrées vers la création et le transfert.
 *
 * Pas de total en tête : la somme des portefeuilles se calculerait ici, en flottants, alors que chaque solde vient de Postgres. Le solde du groupe est déjà sur la Synthèse.
 */
export default function WalletsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { activeGroup } = useActiveGroup();
  const { wallets, isLoading, error } = useWallets();
  const { transfers } = useRecentTransfers();
  const names = new Map(wallets.map((wallet) => [wallet.id, wallet.name]));

  return (
    <Screen
      align="top"
      header={<ScreenHeader title="Portefeuilles" onBack={() => goBackOr(router, '/')} />}
    >
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Dans « {activeGroup?.name ?? '…'} ». Chaque opération est rangée dans un portefeuille ; un
        transfert entre deux ne change pas votre solde, ses frais oui.
      </Text>

      {/* Un transfert demande deux portefeuilles : avant cela, le bouton n'apparaît pas du tout. Grisé, il restait une pastille muette qui posait la question sans y répondre. */}
      <View style={styles.actions}>
        {wallets.length >= 2 ? (
          <ActionButton href="/wallet-transfer" icon="swap-horizontal" label="Transférer" primary />
        ) : null}
        <ActionButton href="/wallet" icon="plus" label="Nouveau portefeuille" />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : error && wallets.length === 0 ? (
        <Text style={[styles.message, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
      ) : (
        <Card flush>
          {wallets.map((wallet, index) => (
            <Fragment key={wallet.id}>
              {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
              <Link href={`/wallet?id=${wallet.id}`} asChild>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${wallet.name}, ${spokenAmount(wallet.balance)}${wallet.isDefault ? ', portefeuille par défaut' : ''}`}
                  accessibilityHint="Ouvre le portefeuille pour le renommer ou ajuster son solde"
                  style={StyleSheet.flatten(styles.row)}
                >
                  <View style={[styles.glyph, { backgroundColor: colors.surfaceMuted }]}>
                    <MaterialCommunityIcons name={walletIcon(wallet.kind)} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.text}>
                    <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                      {wallet.name}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textMuted }]}>
                      {WALLET_KINDS.find((kind) => kind.value === wallet.kind)?.label}
                      {wallet.isDefault ? ' · par défaut' : ''}
                    </Text>
                  </View>
                  <Text
                    style={[styles.balance, { color: wallet.balance < 0 ? colors.danger : colors.text }]}
                  >
                    {withCurrency(formatBalance(wallet.balance))}
                  </Text>
                </Pressable>
              </Link>
            </Fragment>
          ))}
        </Card>
      )}

      {transfers.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">
            Derniers transferts
          </Text>
          <Card flush>
            {transfers.map((transfer, index) => (
              <Fragment key={transfer.id}>
                {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                <View style={styles.transfer} accessible>
                  <MaterialCommunityIcons name="swap-horizontal" size={20} color={colors.textMuted} />
                  <View style={styles.text}>
                    <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                      {names.get(transfer.fromWalletId) ?? '…'} → {names.get(transfer.toWalletId) ?? '…'}
                    </Text>
                    <Text numberOfLines={1} style={[styles.meta, { color: colors.textMuted }]}>
                      {[formatOccurredOn(transfer.occurredOn), transfer.note].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={[styles.balance, { color: colors.text }]}>{formatMoney(transfer.amount)}</Text>
                </View>
              </Fragment>
            ))}
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

function ActionButton({
  href,
  icon,
  label,
  primary = false,
}: {
  href: '/wallet' | '/wallet-transfer';
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  primary?: boolean;
}) {
  const colors = useColors();
  const elevation = useElevation();
  const foreground = primary ? colors.primaryText : colors.text;

  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={StyleSheet.flatten([
          styles.action,
          primary ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface },
          elevation.card,
        ])}
      >
        <MaterialCommunityIcons name={icon} size={20} color={foreground} />
        <Text style={[styles.actionLabel, { color: foreground }]}>{label}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  action: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  actionLabel: {
    fontFamily: font.bold,
    fontSize: 16,
  },
  message: {
    fontFamily: font.regular,
    fontSize: 16,
    textAlign: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: 64,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 17,
  },
  meta: {
    fontFamily: font.regular,
    fontSize: 14,
  },
  balance: {
    fontFamily: font.semibold,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: font.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
  },
  transfer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: 56,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
});
