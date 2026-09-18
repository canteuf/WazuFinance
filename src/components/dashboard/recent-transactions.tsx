import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TransactionRow } from '@/components/transaction/transaction-row';
import { Card } from '@/components/ui/card';
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

  // Une seule carte à filets plutôt qu'une carte par ligne : les dernières opérations forment un relevé, et autant de feuillets détachés donnaient à chaque dépense le poids d'un objet à part.
  return (
    <Card flush>
      {transactions.map((transaction, index) => (
        <Fragment key={transaction.id}>
          {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
          <TransactionRow transaction={transaction} inGroup />
        </Fragment>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    // Décalé du bord : le filet sépare les lignes, il ne barre pas la carte.
    marginHorizontal: spacing.md,
  },
  empty: {
    fontFamily: font.regular,
    fontSize: 14,
    paddingVertical: spacing.lg,
  },
});
