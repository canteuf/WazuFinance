import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ProgressBar } from '@/components/ui/progress-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import { wasEdited } from '@/lib/activity-format';
import type { BudgetProgress, BudgetStatus } from '@/lib/budget-progress';
import { formatAmount } from '@/lib/money';
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

/** Le texte dit ce que la couleur dit : un daltonien lit la même information. */
function statusText(item: BudgetProgress): string {
  if (item.status === 'over') {
    // À exactement 100 %, rien n'est dépassé : « Dépassé de 0,00 € » disait faux. Le statut reste `over` — le budget est épuisé, la prochaine dépense le dépassera —, seul le texte change.
    if (item.remaining === 0) {
      return 'Plafond atteint';
    }
    return `Dépassé de ${formatAmount(Math.abs(item.remaining))} €`;
  }
  if (item.status === 'warning') {
    return `Proche de la limite, il reste ${formatAmount(item.remaining)} €`;
  }
  return `Il reste ${formatAmount(item.remaining)} €`;
}

/**
 * Version courte pour la pastille, qui n'a la place que de quelques mots. Le texte long reste dans l'étiquette d'accessibilité et sous la barre.
 */
function badgeText(item: BudgetProgress): string {
  if (item.status === 'over') {
    return item.remaining === 0
      ? 'Épuisé'
      : `+${formatAmount(Math.abs(item.remaining))} €`;
  }
  return `Reste ${formatAmount(item.remaining)} €`;
}

/** Repli quand RLS masque la catégorie jointe (voir BudgetWithCategory). */
const UNKNOWN_CATEGORY_NAME = 'Catégorie inconnue';

export function BudgetRow({
  item,
  onPress,
}: {
  item: BudgetProgress;
  onPress: () => void;
}) {
  const colors = useColors();
  const elevation = useElevation();
  const isDark = useIsDark();
  const { fontScale } = useWindowDimensions();
  const category = item.budget.category;

  // `category` peut être `null` : RLS masque la ligne jointe quand le budget pointe une catégorie hors de portée du groupe. On retombe sur un libellé et une teinte neutres plutôt que de planter sur des champs manquants.
  const tone = category
    ? categoryTone({ id: category.id, icon: category.icon }, isDark)
    : { tint: colors.textMuted, surface: colors.surfaceMuted };
  const categoryName = category?.name ?? UNKNOWN_CATEGORY_NAME;

  const statusColor: Record<BudgetStatus, string> = {
    ok: colors.textMuted,
    warning: colors.warning,
    over: colors.danger,
  };

  const percent = Math.round(item.ratio * 100);

  // La pastille de catégorie prend la couleur du statut dès qu'il y a une alerte : c'est le premier élément que l'œil rencontre sur la rangée, et une liste triée par urgence doit se lire sans traverser chaque ligne. Sous le seuil, elle revient à la teinte habituelle du poste, qui sert à le reconnaître d'un coup d'œil.
  const iconTint = item.status === 'ok' ? tone.tint : statusColor[item.status];
  // Le fond suit la même règle que le contenu : un aplat très dilué de la couleur du statut en Carnet, la surface neutre en Nocturne où un aplat clair perdrait le contraste du glyphe posé dessus.
  const iconSurface =
    item.status === 'ok'
      ? tone.surface
      : isDark
        ? colors.surfaceMuted
        : `${statusColor[item.status]}1F`;

  // Au-delà du seuil, le nom et les montants s'empilent plutôt que de se disputer la largeur — même motif que budgets-entry.tsx.
  const stacked = fontScale >= stackAtFontScale;
  const edited = wasEdited(item.budget);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${categoryName}, ${formatAmount(item.spent)} euros sur ${formatAmount(item.budget.amount)} euros, ${percent} %. ${statusText(item)}${edited ? '. Plafond modifié' : ''}`}
      onPress={onPress}
      // L'élévation remplace le liseré : en Carnet une ombre basse détache la carte du fond, en Nocturne `elevation.card` porte déjà le liseré, qui est ce qui fait l'élévation sur fond sombre.
      style={[styles.row, elevation.card, { backgroundColor: colors.surface }]}
    >
      <View style={[styles.head, stacked && styles.headStacked]}>
        <View style={styles.identity}>
          {/* Carrée à coins arrondis plutôt que ronde : le rond désigne une personne (avatar, membre d'un groupe), le carré arrondi un poste de dépense. La distinction se tient d'un écran à l'autre. */}
          <View style={[styles.glyph, { backgroundColor: iconSurface }]}>
            <MaterialCommunityIcons
              // Le nom vient de la base ; @expo/vector-icons le type strictement.
              name={
                (category?.icon ?? 'help-circle-outline') as React.ComponentProps<
                  typeof MaterialCommunityIcons
                >['name']
              }
              size={20}
              color={iconTint}
            />
          </View>
          <View style={styles.identityText}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {categoryName}
            </Text>
            <Text style={[styles.percent, { color: statusColor[item.status] }]}>
              {percent} % du plafond
            </Text>
          </View>
        </View>
        <StatusBadge tone={item.status} label={badgeText(item)} />
      </View>

      {/* Le dépensé passe devant : c'est le chiffre qu'on vient chercher, le plafond n'est là que pour lui donner son échelle. Les deux étaient auparavant de même taille, et la rangée n'avait pas de point d'entrée pour l'œil. */}
      <View style={styles.figures}>
        <Text style={[styles.spent, { color: statusColor[item.status] }]}>
          {formatAmount(item.spent)} €
        </Text>
        <Text style={[styles.ceiling, { color: colors.textMuted }]}>
          / {formatAmount(item.budget.amount)} €
        </Text>
      </View>

      {/* Le plancher de 2 % ne vaut que si quelque chose a été dépensé : un budget à zéro ne doit pas afficher un filet qui ferait croire à une dépense. ProgressBar s'en charge à partir du seul ratio. */}
      <ProgressBar ratio={item.spent === 0 ? 0 : item.ratio} tone={item.status} size="lg" />

      {/* Pied de carte : l'état à gauche, la période du plafond à droite. Deux informations de même poids, qu'aligner sur une seule ligne sépare mieux qu'une phrase les enchaînant. */}
      <View style={styles.foot}>
        <Text style={[styles.status, { color: statusColor[item.status] }]} numberOfLines={1}>
          {statusText(item)}
        </Text>
        <Text style={[styles.period, { color: colors.textMuted }]}>
          {item.budget.period === 'weekly' ? 'Hebdomadaire' : 'Mensuel'}
          {edited ? ' · modifié' : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm + 2,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headStacked: {
    // Le nom et les montants cèdent chacun leur propre ligne au lieu de se rétrécir l'un l'autre.
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  identity: {
    flexDirection: 'row',
    // Centré sur les deux lignes de texte : la pastille fait leur hauteur cumulée, et l'aligner en tête la décalerait vers le haut du bloc.
    alignItems: 'center',
    gap: spacing.sm + 2,
    // Cède au badge plutôt que de le pousser hors de l'écran à fort grossissement de police.
    flexShrink: 1,
  },
  identityText: {
    gap: 1,
    flexShrink: 1,
  },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 16,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  percent: {
    fontFamily: font.semibold,
    fontSize: 12,
  },
  figures: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs + 1,
    // Aligné avec le texte qui le surplombe, pas avec la pastille : la colonne des chiffres doit se lire d'un trait vertical.
    flexWrap: 'wrap',
  },
  spent: {
    fontFamily: font.bold,
    fontSize: 20,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  ceiling: {
    fontFamily: font.medium,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  status: {
    fontFamily: font.semibold,
    fontSize: 12.5,
    // Cède au libellé de période plutôt que de le pousser hors de la carte.
    flexShrink: 1,
  },
  period: {
    fontFamily: font.regular,
    fontSize: 12,
    flexShrink: 0,
  },
});
