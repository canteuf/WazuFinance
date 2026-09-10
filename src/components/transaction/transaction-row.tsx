import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { TransactionWithCategory } from '@/data/transactions';
import { wasEdited } from '@/lib/activity-format';
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

/**
 * Une opération dans une liste, sur le tableau de bord comme dans
 * l'historique. Partagée pour que l'empilement à forte échelle de police
 * n'existe qu'à un seul endroit.
 */
export function TransactionRow({ transaction }: { transaction: TransactionWithCategory }) {
  const colors = useColors();
  const elevation = useElevation();
  const isDark = useIsDark();
  const { fontScale } = useWindowDimensions();

  // Au-delà du seuil, le montant passe sous le nom plutôt que de l'écraser.
  const stacked = fontScale >= stackAtFontScale;

  const icon = transaction.category?.icon ?? 'tag';
  const tone = categoryTone({ id: transaction.category_id ?? transaction.id, icon }, isDark);

  const edited = wasEdited(transaction);

  // « Carrefour · aujourd'hui », ou la seule date quand il n'y a pas de note.
  // Sans la date, deux lignes de la même catégorie sont indiscernables.
  // « modifié » en fin de ligne : un mot, jamais une icône seule. Le détail
  // — qui, quoi, avant, après — est dans l'écran Activité.
  const meta = [
    transaction.note,
    formatOccurredOn(transaction.occurred_on),
    edited ? 'modifié' : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  // Même nœud dans les deux dispositions : sous le nom quand on empile, en
  // bout de ligne sinon.
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
    <Link href={`/transaction?id=${transaction.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        // Le lecteur d'écran lit cette étiquette à la place des textes de la
        // ligne : sans ce suffixe, « modifié » n'existe que pour qui voit.
        accessibilityLabel={`Modifier ${transaction.category?.name ?? 'opération'}${edited ? '. Opération modifiée' : ''}`}
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
          <Text numberOfLines={stacked ? 2 : 1} style={[styles.name, { color: colors.text }]}>
            {transaction.category?.name ?? 'Sans catégorie'}
          </Text>
          <Text numberOfLines={stacked ? 2 : 1} style={[styles.note, { color: colors.textMuted }]}>
            {meta}
          </Text>
          {stacked ? amount : null}
        </View>

        {stacked ? null : amount}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.sm + 3,
  },
  rowStacked: {
    // La pastille reste en haut du bloc de texte, qui compte alors trois
    // lignes au lieu de deux.
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
});
