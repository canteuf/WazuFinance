import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TransactionRow } from '@/components/transaction/transaction-row';
import { Card } from '@/components/ui/card';
import { FadeInRow } from '@/components/ui/fade-in-row';
import type { TransactionWithCategory } from '@/data/transactions';
import { useCanWrite } from '@/hooks/use-can-write';
import { font, spacing, useColors } from '@/theme/tokens';

export function RecentTransactions({
  transactions,
}: {
  transactions: TransactionWithCategory[];
}) {
  const colors = useColors();
  const canWrite = useCanWrite();

  if (transactions.length === 0) {
    return (
      // « sur cette période » et non « pour l'instant » : la liste est bornée à la période affichée en tête d'écran, et un compte qui contient des opérations plus anciennes n'est pas vide.
      <Text style={[styles.empty, { color: colors.textMuted }]}>
        {canWrite
          ? 'Aucune opération sur cette période. Touchez « Ajouter » pour en noter une.'
          : 'Aucune opération sur cette période.'}
      </Text>
    );
  }

  // Une seule carte à filets plutôt qu'une carte par ligne : les dernières opérations forment un relevé, et autant de feuillets détachés donnaient à chaque dépense le poids d'un objet à part.
  return (
    <Card flush>
      {transactions.map((transaction, index) => (
        <Fragment key={transaction.id}>
          {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
          <FadeInRow index={index}>
            <TransactionRow transaction={transaction} inGroup />
          </FadeInRow>
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
    fontSize: 16,
    paddingVertical: spacing.lg,
  },
});
