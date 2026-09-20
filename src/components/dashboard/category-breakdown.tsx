import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import type { CategorySlice } from '@/data/summary';
import { useCategoryBreakdown } from '@/hooks/use-category-breakdown';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatAmount } from '@/lib/money';
import { categoryTone } from '@/theme/category-colors';
import { font, radius, spacing, useColors, useIsDark } from '@/theme/tokens';

/**
 * Nombre de parts détaillées avant regroupement.
 *
 * Au-delà, les barres deviennent trop fines pour se comparer d'un coup d'œil, et le tableau de bord n'est pas l'écran où l'on épluche le détail.
 */
const VISIBLE_SLICES = 5;

type Row = {
  key: string;
  name: string;
  icon: string;
  total: number;
};

/**
 * Regroupe la queue de distribution en une part unique.
 *
 * Sans ça, un groupe utilisant les quatorze catégories du seed produirait quatorze barres dont la moitié à moins de 2 % — illisibles et sans intérêt.
 */
function toRows(slices: CategorySlice[]): Row[] {
  const head = slices.slice(0, VISIBLE_SLICES).map((slice) => ({
    key: slice.categoryId,
    name: slice.name,
    icon: slice.icon,
    total: slice.total,
  }));

  const tail = slices.slice(VISIBLE_SLICES);
  if (tail.length === 0) {
    return head;
  }

  return [
    ...head,
    {
      key: 'others',
      name: `${tail.length} autres`,
      // Teinte neutre : ce regroupement n'est pas une catégorie et ne doit pas emprunter la couleur de l'une d'elles.
      icon: 'dots-horizontal',
      total: tail.reduce((sum, slice) => sum + slice.total, 0),
    },
  ];
}

/**
 * Répartition des dépenses de la période (spec 2.6).
 *
 * Des barres construites en Views plutôt qu'un graphique : aucune bibliothèque à installer, le rendu suit l'échelle de police système, et une barre horizontale se compare mieux qu'un secteur de camembert.
 *
 * Les proportions se calculent sur la somme des parts, jamais sur le total des sorties du résumé : celui-ci inclut les dépenses sans catégorie, que la répartition ne montre pas, et les barres n'atteindraient jamais 100 %.
 */
export function CategoryBreakdown() {
  const colors = useColors();
  const isDark = useIsDark();
  const { slices, isLoading, error } = useCategoryBreakdown();

  if (error) {
    return (
      <View style={styles.block}>
        <Text style={[styles.heading, { color: colors.textMuted }]}>Répartition</Text>
        <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.block}>
        <Text style={[styles.heading, { color: colors.textMuted }]}>Répartition</Text>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </View>
    );
  }

  // Aucune dépense sur la période : la liste voisine dit déjà qu'il n'y a rien. Un second état vide ne ferait que répéter la même information.
  if (slices.length === 0) {
    return null;
  }

  const rows = toRows(slices);
  const total = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <Card>
      <View style={styles.cardHead}>
        <Text style={[styles.heading, { color: colors.text }]}>Répartition</Text>
        <Text style={[styles.total, { color: colors.textMuted }]}>
          {formatAmount(total)} €
        </Text>
      </View>

      {/* Ruban des proportions : les mêmes parts que les barres ci-dessous, mises bout à bout. Il donne la composition de la période d'un seul regard, là où les barres servent à comparer poste par poste. */}
      <View style={styles.ribbon}>
        {rows.map((row) => {
          const tone = categoryTone({ id: row.key, icon: row.icon }, isDark);
          const share = total === 0 ? 0 : row.total / total;

          return (
            <View
              key={row.key}
              style={[
                styles.ribbonSlice,
                { flexGrow: Math.max(share, 0.02), backgroundColor: tone.tint },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.rows}>
        {rows.map((row) => {
          const tone = categoryTone({ id: row.key, icon: row.icon }, isDark);
          const share = total === 0 ? 0 : row.total / total;

          return (
            <View
              key={row.key}
              accessibilityRole="text"
              accessibilityLabel={`${row.name} : ${formatAmount(row.total)} euros, ${Math.round(share * 100)} %`}
              style={styles.row}
            >
              <View style={styles.rowHead}>
                <View style={styles.legend}>
                  {/* La pastille rattache la ligne à sa tranche du ruban : sans elle, les deux lectures ne se raccordent pas. */}
                  <View style={[styles.legendDot, { backgroundColor: tone.tint }]} />
                  <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                    {row.name}
                  </Text>
                </View>
                <Text style={[styles.amount, { color: colors.text }]}>
                  {formatAmount(row.total)} €
                </Text>
              </View>

              {/* La piste porte la teinte en fond très atténué, la barre la teinte pleine : la part se lit même sans comparer les longueurs entre elles. */}
              <View style={[styles.track, { backgroundColor: tone.surface }]}>
                <View
                  style={[
                    styles.bar,
                    // Un plancher visible : une part à 0,4 % doit rester une barre, pas un trait invisible qu'on prend pour un bug.
                    { width: `${Math.max(share * 100, 2)}%`, backgroundColor: tone.tint },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm + 4,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  heading: {
    fontFamily: font.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  total: {
    fontFamily: font.medium,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  ribbon: {
    flexDirection: 'row',
    gap: 2,
    height: 8,
    marginBottom: spacing.md + 2,
  },
  ribbonSlice: {
    height: '100%',
    borderRadius: radius.pill,
    // Sans base nulle, flexGrow partage la place restante au lieu de la totalité : les tranches ne seraient plus proportionnelles.
    flexBasis: 0,
  },
  rows: {
    gap: spacing.sm + 4,
  },
  row: {
    gap: spacing.xs + 2,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  name: {
    fontFamily: font.regular,
    fontSize: 16,
    letterSpacing: -0.07,
    // Cède au montant plutôt que de le pousser hors de l'écran à fort grossissement de police.
    flexShrink: 1,
  },
  amount: {
    fontFamily: font.bold,
    fontSize: 15,
    letterSpacing: -0.13,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: radius.pill,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 16,
  },
  loader: {
    alignSelf: 'flex-start',
  },
});
