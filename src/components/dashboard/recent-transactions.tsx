import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TransactionWithCategory } from '@/data/transactions';
import { formatSigned } from '@/lib/money';
import { radius, spacing, useColors } from '@/theme/tokens';

export function RecentTransactions({
  transactions,
}: {
  transactions: TransactionWithCategory[];
}) {
  const colors = useColors();

  if (transactions.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.textMuted }]}>
        Aucune opération pour l’instant. Touchez + pour en ajouter une.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {transactions.map((transaction) => (
        <Link key={transaction.id} href={`/transaction?id=${transaction.id}`} asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Modifier ${transaction.category?.name ?? 'opération'}`}
            // Aplati : <Link asChild> transmet le style à son enfant et avertit
            // s'il reçoit un tableau.
            style={StyleSheet.flatten([
              styles.row,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ])}
          >
            <MaterialCommunityIcons
              // Le nom vient de la base ; @expo/vector-icons le type de façon
              // stricte, d'où la conversion explicite.
              name={
                (transaction.category?.icon ??
                  'tag') as React.ComponentProps<typeof MaterialCommunityIcons>['name']
              }
              size={20}
              color={colors.textMuted}
            />
            <View style={styles.rowText}>
              <Text style={[styles.name, { color: colors.text }]}>
                {transaction.category?.name ?? 'Sans catégorie'}
              </Text>
              {transaction.note ? (
                <Text numberOfLines={1} style={[styles.note, { color: colors.textMuted }]}>
                  {transaction.note}
                </Text>
              ) : null}
            </View>
            <Text
              style={[
                styles.amount,
                { color: transaction.type === 'income' ? colors.primary : colors.text },
              ]}
            >
              {formatSigned(Number(transaction.amount), transaction.type)}
            </Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
  },
  note: {
    fontSize: 12,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
  empty: {
    fontSize: 14,
    paddingVertical: spacing.lg,
  },
});
