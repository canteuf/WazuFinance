import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TransactionWithCategory } from '@/data/transactions';
import { formatSigned } from '@/lib/money';
import { categoryTone } from '@/theme/category-colors';
import { font, radius, spacing, useColors, useElevation, useIsDark } from '@/theme/tokens';

export function RecentTransactions({
  transactions,
}: {
  transactions: TransactionWithCategory[];
}) {
  const colors = useColors();
  const elevation = useElevation();
  // Un seul appel pour toute la liste : categoryTone est une fonction, pas un
  // hook, précisément pour pouvoir être appelée dans la boucle ci-dessous.
  const isDark = useIsDark();

  if (transactions.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.textMuted }]}>
        Aucune opération pour l’instant. Touchez + pour en ajouter une.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {transactions.map((transaction) => {
        const icon = transaction.category?.icon ?? 'tag';
        const tone = categoryTone({ id: transaction.category_id ?? transaction.id, icon }, isDark);

        return (
          <Link key={transaction.id} href={`/transaction?id=${transaction.id}`} asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Modifier ${transaction.category?.name ?? 'opération'}`}
              // Aplati : <Link asChild> transmet le style à son enfant et avertit
              // s'il reçoit un tableau.
              style={StyleSheet.flatten([
                styles.row,
                elevation.card,
                { backgroundColor: colors.surface },
              ])}
            >
              <View style={[styles.glyph, { backgroundColor: tone.surface }]}>
                <MaterialCommunityIcons
                  // Le nom vient de la base ; @expo/vector-icons le type de façon
                  // stricte, d'où la conversion explicite.
                  name={icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                  size={18}
                  color={tone.tint}
                />
              </View>

              <View style={styles.rowText}>
                <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
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
                  { color: transaction.type === 'income' ? colors.positive : colors.text },
                ]}
              >
                {formatSigned(Number(transaction.amount), transaction.type)}
              </Text>
            </Pressable>
          </Link>
        );
      })}
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
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radius.md,
  },
  glyph: {
    width: 36,
    height: 36,
    borderRadius: radius.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 15,
  },
  note: {
    fontFamily: font.regular,
    fontSize: 12,
  },
  amount: {
    fontFamily: font.bold,
    fontSize: 15,
    // Les montants s'alignent en colonne : sans chiffres tabulaires, la
    // virgule danse d'une ligne à l'autre.
    fontVariant: ['tabular-nums'],
  },
  empty: {
    fontFamily: font.regular,
    fontSize: 14,
    paddingVertical: spacing.lg,
  },
});
