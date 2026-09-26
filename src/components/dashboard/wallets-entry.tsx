import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { walletIcon } from '@/components/wallet/wallet-kinds';
import { useWallets } from '@/hooks/use-wallets';
import { formatBalance, formatMoney, spokenAmount, withCurrency } from '@/lib/money';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/**
 * Où est l'argent : le solde de chaque portefeuille, sur la Synthèse.
 *
 * Le solde de la période, au-dessus, dit ce qui est entré et sorti ce mois-ci ; celui-ci dit ce qu'il y a vraiment, en poche et sur le téléphone, depuis toujours. Les deux répondent à des questions différentes, d'où deux cartes.
 *
 * Toujours présente : avec le seul « Principal », elle invite à ajouter MoMo, Orange Money ou la banque.
 */
export function WalletsEntry() {
  const colors = useColors();
  const { wallets } = useWallets();

  if (wallets.length === 0) {
    return null;
  }

  return (
    <Card>
      <View style={styles.cardHead}>
        <View style={styles.cardTitle}>
          <MaterialCommunityIcons name="wallet-outline" size={18} color={colors.primary} />
          <Text style={[styles.heading, { color: colors.text }]}>Portefeuilles</Text>
        </View>
        <Link href="/wallets" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel="Gérer les portefeuilles">
            <Text style={[styles.link, { color: colors.primary }]}>Gérer</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.rows}>
        {wallets.map((wallet) => (
          <View
            key={wallet.id}
            accessible
            accessibilityLabel={`${wallet.name} : ${spokenAmount(wallet.balance)}`}
            style={styles.row}
          >
            <View style={[styles.glyph, { backgroundColor: colors.surfaceMuted }]}>
              <MaterialCommunityIcons name={walletIcon(wallet.kind)} size={16} color={colors.textMuted} />
            </View>
            <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
              {wallet.name}
            </Text>
            <Text
              style={[styles.balance, { color: wallet.balance < 0 ? colors.danger : colors.text }]}
            >
              {withCurrency(formatBalance(wallet.balance))}
            </Text>
          </View>
        ))}
      </View>

      {wallets.length === 1 ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Ajoutez MoMo, Orange Money ou votre banque pour savoir où est chaque franc. Solde actuel :{' '}
          {formatMoney(wallets[0].balance)}.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  heading: {
    fontFamily: font.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  link: {
    fontFamily: font.semibold,
    fontSize: 15,
    paddingVertical: spacing.sm,
  },
  rows: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  glyph: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 16,
  },
  balance: {
    fontFamily: font.semibold,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    marginTop: spacing.sm,
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 21,
  },
});
