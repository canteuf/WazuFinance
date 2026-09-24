import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TransactionRow } from '@/components/transaction/transaction-row';
import { Card } from '@/components/ui/card';
import { usePendingTransactions } from '@/hooks/use-offline-status';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Les saisies faites hors ligne, au-dessus des dernières opérations, jusqu'à leur envoi.
 *
 * Sans ce bloc, une dépense enregistrée sans réseau ne laissait aucune trace à l'écran : la feuille se fermait et la liste restait la même, comme si la saisie avait été perdue. Un bloc à part plutôt que des lignes glissées dans la liste : celle-ci et le solde au-dessus décrivent ce que la base a accepté, et la phrase sous le titre dit pourquoi ces montants n'y sont pas encore comptés.
 */
export function PendingTransactions() {
  const colors = useColors();
  const transactions = usePendingTransactions();

  if (transactions.length === 0) {
    return null;
  }

  return (
    <View style={styles.block}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="cloud-upload-outline" size={20} color={colors.textMuted} />
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          En attente d’envoi
        </Text>
      </View>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        Enregistrées sur le téléphone. Elles seront envoyées et comptées dans le solde au retour du réseau.
      </Text>
      <Card flush>
        {transactions.map((transaction, index) => (
          <Fragment key={transaction.id}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
            <TransactionRow transaction={transaction} inGroup pending />
          </Fragment>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontFamily: font.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    marginHorizontal: spacing.md,
  },
});
