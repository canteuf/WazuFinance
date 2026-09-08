import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { TransactionWithCategory } from '@/data/transactions';
import { formatOccurredOn } from '@/lib/dates';
import { formatSigned } from '@/lib/money';
import { categoryTone } from '@/theme/category-colors';
import {
  font,
  radius,
  spacing,
  stackAtFontScale,
  useColors,
  useElevation,
  useIsDark,
} from '@/theme/tokens';

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
  // useWindowDimensions() re-rend quand le réglage système change, à la
  // différence de PixelRatio.getFontScale(), lu une fois pour toutes.
  const { fontScale } = useWindowDimensions();
  // Au-delà du seuil, le montant passe sous le nom plutôt que de l'écraser.
  const stacked = fontScale >= stackAtFontScale;

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
        // « Carrefour · aujourd'hui », ou la seule date quand il n'y a pas de
        // note. Sans la date, deux lignes de la même catégorie étaient
        // indiscernables dans la liste.
        const meta = [transaction.note, formatOccurredOn(transaction.occurred_on)]
          .filter((part): part is string => Boolean(part))
          .join(' · ');
        const tone = categoryTone({ id: transaction.category_id ?? transaction.id, icon }, isDark);

        // Même nœud dans les deux dispositions : sous le nom quand on empile,
        // en bout de ligne sinon.
        const amount = (
          <Text
            style={[
              styles.amount,
              stacked && styles.amountStacked,
              { color: transaction.type === 'income' ? colors.positive : colors.text },
            ]}
          >
            {formatSigned(Number(transaction.amount), transaction.type)}
          </Text>
        );

        return (
          <Link key={transaction.id} href={`/transaction?id=${transaction.id}`} asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Modifier ${transaction.category?.name ?? 'opération'}`}
              // Aplati : <Link asChild> transmet le style à son enfant et avertit
              // s'il reçoit un tableau.
              style={StyleSheet.flatten([
                styles.row,
                stacked && styles.rowStacked,
                elevation.card,
                { backgroundColor: colors.surface },
              ])}
            >
              <View style={[styles.glyph, { backgroundColor: tone.surface }]}>
                <MaterialCommunityIcons
                  // Le nom vient de la base ; @expo/vector-icons le type de façon
                  // stricte, d'où la conversion explicite.
                  name={icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                  size={16}
                  color={tone.tint}
                />
              </View>

              <View style={styles.rowText}>
                <Text
                  numberOfLines={stacked ? 2 : 1}
                  style={[styles.name, { color: colors.text }]}
                >
                  {transaction.category?.name ?? 'Sans catégorie'}
                </Text>
                <Text
                  numberOfLines={stacked ? 2 : 1}
                  style={[styles.note, { color: colors.textMuted }]}
                >
                  {meta}
                </Text>
                {stacked ? amount : null}
              </View>

              {stacked ? null : amount}
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm - 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 3,
    borderRadius: radius.sm + 3,
  },
  rowStacked: {
    // La pastille reste en haut du bloc de texte, qui compte alors trois
    // lignes au lieu d'une.
    alignItems: 'flex-start',
  },
  glyph: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 13,
    letterSpacing: -0.07,
  },
  note: {
    fontFamily: font.regular,
    fontSize: 11,
  },
  amount: {
    fontFamily: font.bold,
    fontSize: 13,
    letterSpacing: -0.13,
    // Les montants s'alignent en colonne : sans chiffres tabulaires, la
    // virgule danse d'une ligne à l'autre.
    fontVariant: ['tabular-nums'],
  },
  amountStacked: {
    marginTop: 2,
  },
  empty: {
    fontFamily: font.regular,
    fontSize: 14,
    paddingVertical: spacing.lg,
  },
});
