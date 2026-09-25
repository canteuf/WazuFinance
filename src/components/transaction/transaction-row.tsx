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
 * Une opération dans une liste, sur le tableau de bord comme dans l'historique. Partagée pour que l'empilement à forte échelle de police n'existe qu'à un seul endroit.
 */
export function TransactionRow({
  transaction,
  inGroup = false,
  ledger = false,
  pending = false,
}: {
  transaction: TransactionWithCategory;
  /** Vrai quand la ligne vit dans une carte partagée avec ses voisines : elle n'a alors ni fond, ni relief, ni rayon propres, c'est la carte qui les porte. */
  inGroup?: boolean;
  /**
   * Disposition « livre de comptes » de l'historique : le montant passe sous le titre, avec « Débit » ou « Crédit » en regard, et la date disparaît de la ligne puisque l'en-tête de jour la porte déjà.
   */
  ledger?: boolean;
  /**
   * Saisie faite hors ligne, pas encore acceptée par la base : elle n'a pas d'identifiant, donc rien à ouvrir. La ligne n'est pas un lien, et « en attente d'envoi » remplace la mention « modifié ».
   */
  pending?: boolean;
}) {
  const colors = useColors();
  const elevation = useElevation();
  const isDark = useIsDark();
  const { fontScale } = useWindowDimensions();

  // Au-delà du seuil, le montant passe sous le nom plutôt que de l'écraser.
  const stacked = fontScale >= stackAtFontScale;

  // Un versement ou un retrait d'épargne n'a pas de catégorie : il se reconnaît à sa tirelire, et se gère depuis l'objectif, pas depuis cette ligne (la base refuse de le modifier ici).
  const savings = transaction.is_savings;

  const icon = savings ? 'piggy-bank-outline' : (transaction.category?.icon ?? 'tag');
  const tone = categoryTone({ id: transaction.category_id ?? transaction.id, icon }, isDark);

  const edited = wasEdited(transaction);

  const categoryName = savings ? 'Épargne' : (transaction.category?.name ?? 'Sans catégorie');

  // La note tient le titre quand elle existe : c'est « Biocoop » qu'on reconnaît d'un coup d'œil dans une liste, pas « Alimentation », qui se répète sur dix lignes. Sans note, la catégorie reprend le titre plutôt que de laisser la ligne sans nom.
  const title = transaction.note?.trim() || categoryName;
  // Le badge ne répète pas le titre : quand la note manque, la catégorie est déjà en titre.
  const showCategoryBadge = title !== categoryName;

  // « aujourd'hui · modifié ». « modifié » en toutes lettres, jamais une icône seule. Le détail — qui, quoi, avant, après — est dans l'écran Activité.
  const meta = [
    ledger ? null : formatOccurredOn(transaction.occurred_on),
    pending ? 'en attente d’envoi' : edited ? 'modifié' : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
  const income = transaction.type === 'income';

  // Même nœud dans les deux dispositions : sous le nom quand on empile, en bout de ligne sinon.
  const amount = (
    <Text
      style={[
        styles.amount,
        stacked && !ledger && styles.amountStacked,
        ledger && styles.amountLedger,
        { color: transaction.type === 'income' ? colors.positive : colors.text },
      ]}
    >
      {formatSigned(Number(transaction.amount), transaction.type)}
    </Text>
  );

  // Aplati : <Link asChild> transmet le style à son enfant et avertit s'il reçoit un tableau.
  const rowStyle = StyleSheet.flatten([
    styles.row,
    (stacked || ledger) && styles.rowStacked,
    inGroup ? null : elevation.card,
    inGroup ? null : { backgroundColor: colors.surface },
  ]);

  const content = (
    <>
      <View style={[styles.glyph, ledger && styles.glyphLedger, { backgroundColor: tone.surface }]}>
        <MaterialCommunityIcons
          // Le nom vient de la base ; @expo/vector-icons le type de façon stricte, d'où la conversion explicite.
          name={icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
          size={19}
          color={tone.tint}
        />
      </View>

      <View style={styles.rowText}>
        <Text numberOfLines={stacked ? 2 : 1} style={[styles.name, { color: colors.text }]}>
          {title}
        </Text>
        <View style={[styles.metaRow, stacked && styles.metaRowStacked]}>
          {showCategoryBadge ? (
            <View style={[styles.categoryTag, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.categoryTagLabel, { color: colors.text }]} numberOfLines={1}>
                {categoryName}
              </Text>
            </View>
          ) : null}
          {meta ? (
            <Text numberOfLines={1} style={[styles.note, { color: colors.textMuted }]}>
              {meta}
            </Text>
          ) : null}
        </View>
        {ledger ? (
          <View style={styles.ledgerAmountRow}>
            {amount}
            {/* Le mot double la couleur du montant : un lecteur daltonien ou d'écran distingue un crédit d'un débit sans comparer deux verts. */}
            <Text style={[styles.direction, { color: income ? colors.positive : colors.textMuted }]}>
              {income ? 'Crédit' : 'Débit'}
            </Text>
          </View>
        ) : stacked ? (
          amount
        ) : null}
      </View>

      {stacked || ledger ? null : amount}
    </>
  );

  if (pending || savings) {
    return (
      <View
        accessible
        accessibilityLabel={`${title}${showCategoryBadge ? `, ${categoryName}` : ''}. ${pending ? 'En attente d’envoi' : 'Se gère depuis l’écran Épargne'}`}
        style={rowStyle}
      >
        {content}
      </View>
    );
  }

  return (
    <Link href={`/transaction?id=${transaction.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        // Le lecteur d'écran lit cette étiquette à la place des textes de la ligne : la catégorie y reste énoncée même quand elle n'est plus le titre, puisqu'elle n'apparaît alors que dans un badge visuel. Sans le suffixe, « modifié » n'existe que pour qui voit.
        accessibilityLabel={`Modifier ${title}${showCategoryBadge ? `, ${categoryName}` : ''}${edited ? '. Opération modifiée' : ''}`}
        style={rowStyle}
      >
        {content}
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
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  rowStacked: {
    // La pastille reste en haut du bloc de texte, qui compte alors trois lignes au lieu de deux.
    alignItems: 'flex-start',
  },
  glyph: {
    width: 40,
    height: 40,
    // Carrée à coins arrondis, comme la pastille d'une enveloppe : le rond est réservé aux personnes, le carré arrondi aux postes de dépense.
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 17,
    letterSpacing: -0.1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaRowStacked: {
    // À fort grossissement, le badge et la date ne tiennent plus côte à côte.
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 3,
  },
  categoryTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    flexShrink: 1,
  },
  categoryTagLabel: {
    fontFamily: font.semibold,
    fontSize: 13,
    lineHeight: 17,
  },
  note: {
    fontFamily: font.regular,
    fontSize: 14,
    flexShrink: 1,
  },
  amount: {
    fontFamily: font.semibold,
    fontSize: 17,
    letterSpacing: -0.13,
    // Les montants s'alignent en colonne : sans chiffres tabulaires, la virgule danse d'une ligne à l'autre.
    fontVariant: ['tabular-nums'],
  },
  amountStacked: {
    marginTop: 2,
  },
  amountLedger: {
    fontFamily: font.bold,
    fontSize: 21,
    letterSpacing: -0.3,
  },
  glyphLedger: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
  },
  ledgerAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs + 2,
  },
  direction: {
    fontFamily: font.regular,
    fontSize: 15,
  },
});
