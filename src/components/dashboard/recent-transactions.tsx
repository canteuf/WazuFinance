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
      // « sur cette période » et non « pour l'instant » : la liste est bornée à la période affichée en tête d'écran, et un compte qui contient des opérations plus anciennes n'est pas vide.
      <Text style={[styles.empty, { color: colors.textMuted }]}>
        Aucune opération sur cette période. Touchez + pour en ajouter une.
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
