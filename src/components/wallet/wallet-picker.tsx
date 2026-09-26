import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { walletIcon } from '@/components/wallet/wallet-kinds';
import type { WalletOverview } from '@/data/wallets';
import { spokenAmount } from '@/lib/money';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/**
 * Choix du portefeuille, en pastilles qui passent à la ligne : quatre ou cinq portefeuilles tiennent sur deux lignes sans défilement caché. Chaque pastille dit le solde au lecteur d'écran, pour choisir celui qui a de quoi payer.
 */
export function WalletPicker({
  wallets,
  selectedId,
  onSelect,
}: {
  wallets: WalletOverview[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const colors = useColors();

  return (
    <View accessibilityRole="radiogroup" style={styles.row}>
      {wallets.map((wallet) => {
        const selected = wallet.id === selectedId;
        return (
          <Pressable
            key={wallet.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${wallet.name}, solde ${spokenAmount(wallet.balance)}`}
            onPress={() => onSelect(wallet.id)}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.primary : colors.surface,
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={walletIcon(wallet.kind)}
              size={16}
              color={selected ? colors.primaryText : colors.textMuted}
            />
            <Text
              numberOfLines={1}
              style={[styles.label, { color: selected ? colors.primaryText : colors.text }]}
            >
              {wallet.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: 44,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    maxWidth: '100%',
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 15,
    flexShrink: 1,
  },
});
