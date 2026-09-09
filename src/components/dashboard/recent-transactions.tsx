import { StyleSheet, Text, View } from 'react-native';

import { TransactionRow } from '@/components/transaction/transaction-row';
import type { TransactionWithCategory } from '@/data/transactions';
import { font, spacing, useColors } from '@/theme/tokens';

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
        <TransactionRow key={transaction.id} transaction={transaction} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm + 2,
  },
  empty: {
    fontFamily: font.regular,
    fontSize: 14,
    paddingVertical: spacing.lg,
  },
});
