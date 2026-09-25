import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ProgressBar } from '@/components/ui/progress-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import { wasEdited } from '@/lib/activity-format';
import type { BudgetProgress, BudgetStatus } from '@/lib/budget-progress';
import { formatMoney, spokenAmount } from '@/lib/money';
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

/** Sous le nom : ce qui reste, ou de combien le plafond est dépassé. Le texte dit ce que la couleur dit, pour qui ne la distingue pas. Un budget hebdomadaire le précise : ses chiffres ne portent que sur la semaine, pas sur la période du reste de l'écran. */
function statusText(item: BudgetProgress): string {
  const scope = item.budget.period === 'weekly' ? ' cette semaine' : '';
  if (item.status === 'over') {
    // À exactement 100 %, rien n'est dépassé : « Dépassé de 0 XAF » disait faux. Le statut reste `over` — le budget est épuisé, la prochaine dépense le dépassera —, seul le texte change.
    if (item.remaining === 0) {
      return `Plafond atteint${scope}`;
    }
    return `Dépassement de ${formatMoney(Math.abs(item.remaining))}${scope}`;
  }
  return `Reste ${formatMoney(item.remaining)}${scope}`;
}

/** La pastille qualifie l'état en quelques mots, d'après la maquette : « Seuil d'alerte (84 %) », « Sous contrôle (57 %) ». */
function badgeText(item: BudgetProgress, percent: number): string {
  if (item.status === 'over') {
    return item.remaining === 0 ? 'Épuisé (100 %)' : `Dépassement +${formatMoney(Math.abs(item.remaining))}`;
  }
  if (item.status === 'warning') {
    return `Seuil d’alerte (${percent} %)`;
  }
  return `Sous contrôle (${percent} %)`;
}

/** Repli quand RLS masque la catégorie jointe (voir BudgetWithCategory). */
const UNKNOWN_CATEGORY_NAME = 'Catégorie inconnue';

/**
 * Carte d'enveloppe d'après la maquette Stitch `budgets_wazu_finance` : l'icône et le nom, ce qui reste, une pastille d'état, puis le dépensé sur le plafond et la barre.
 */
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
    ok: colors.text,
    warning: colors.warning,
    over: colors.danger,
  };

  const percent = Math.round(item.ratio * 100);

  // La pastille de catégorie prend la couleur du statut dès qu'il y a une alerte : c'est le premier élément que l'œil rencontre sur la carte, et une liste triée par urgence doit se lire sans traverser chaque ligne. Sous le seuil, elle garde la teinte du poste, qui sert à le reconnaître.
  const iconTint = item.status === 'ok' ? tone.tint : statusColor[item.status];
  // Un aplat très dilué de la couleur du statut en Carnet, la surface neutre en Nocturne où un aplat clair perdrait le contraste du glyphe.
  const iconSurface =
    item.status === 'ok'
      ? tone.surface
      : isDark
        ? colors.surfaceMuted
        : `${statusColor[item.status]}1F`;

  const stacked = fontScale >= stackAtFontScale;
  const edited = wasEdited(item.budget);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${categoryName}, ${spokenAmount(item.spent)} sur ${spokenAmount(item.budget.amount)}, ${percent} %. ${statusText(item)}${edited ? '. Plafond modifié' : ''}. Toucher pour ajuster le plafond.`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        elevation.card,
        { backgroundColor: colors.surface, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <View style={[styles.head, stacked && styles.headStacked]}>
        <View style={styles.identity}>
          {/* Carré à coins arrondis : le rond désigne une personne, le carré arrondi un poste de dépense. */}
          <View style={[styles.glyph, { backgroundColor: iconSurface }]}>
            <MaterialCommunityIcons
              // Le nom vient de la base ; @expo/vector-icons le type strictement.
              name={
                (category?.icon ?? 'help-circle-outline') as React.ComponentProps<
                  typeof MaterialCommunityIcons
                >['name']
              }
              size={22}
              color={iconTint}
            />
          </View>
          <View style={styles.identityText}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {categoryName}
            </Text>
            <Text
              style={[
                styles.sub,
                { color: item.status === 'over' ? colors.danger : colors.textMuted },
              ]}
              numberOfLines={1}
            >
              {statusText(item)}
              {edited ? ' · modifié' : ''}
            </Text>
          </View>
        </View>
        <StatusBadge tone={item.status} label={badgeText(item, percent)} />
      </View>

      {/* Le dépensé passe devant : c'est le chiffre qu'on vient chercher, le plafond lui donne son échelle. */}
      <View style={styles.figures}>
        <Text style={[styles.spent, { color: statusColor[item.status] }]}>
          {formatMoney(item.spent)}
        </Text>
        <Text style={[styles.ceiling, { color: colors.textMuted }]}>
          sur {formatMoney(item.budget.amount)}{item.status === 'over' ? ` (${percent} %)` : ''}
        </Text>
      </View>

      {/* Le plancher de 2 % ne vaut que si quelque chose a été dépensé : ProgressBar s'en charge à partir du seul ratio. */}
      <ProgressBar ratio={item.spent === 0 ? 0 : item.ratio} tone={item.status} size="lg" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm + 4,
    padding: spacing.md + 2,
    borderRadius: radius.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headStacked: {
    flexDirection: 'column',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    // Cède au badge plutôt que de le pousser hors de l'écran à fort grossissement de police.
    flexShrink: 1,
  },
  identityText: {
    gap: 2,
    flexShrink: 1,
  },
  glyph: {
    width: 44,
    height: 44,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  name: {
    fontFamily: font.bold,
    fontSize: 19,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  sub: {
    fontFamily: font.regular,
    fontSize: 15,
  },
  figures: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  spent: {
    fontFamily: font.bold,
    fontSize: 24,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  ceiling: {
    fontFamily: font.regular,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
});
