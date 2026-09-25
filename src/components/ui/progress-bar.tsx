import { StyleSheet, View, type DimensionValue } from 'react-native';

import type { BudgetStatus } from '@/lib/budget-progress';
import { radius, useColors } from '@/theme/tokens';

/** Ce que la barre représente, quand ce n'est pas un statut de budget. */
export type ProgressTone = BudgetStatus | 'accent' | 'positive' | 'muted';

/**
 * Piste et remplissage d'une progression.
 *
 * La couleur suit le statut déjà calculé par `budgetProgress()` — accent sous le seuil, ocre à partir de 80 %, rouge brique au dépassement — plutôt que de comparer à nouveau le ratio ici : deux définitions du même seuil finiraient par diverger, et celle qui fait foi est couverte par Jest.
 *
 * Un objectif d'épargne n'a pas de statut de budget : il passe « accent », et « muted » une fois atteint, rangé sous les objectifs en cours — atteindre une cible d'épargne est une réussite, pas un dépassement, et la barre pleine le dit déjà.
 *
 * Trois fichiers portaient la même piste, le même remplissage et la même formule de largeur recopiée mot pour mot ; ils partagent désormais celle-ci.
 */
export function ProgressBar({
  ratio,
  tone = 'accent',
  size = 'md',
}: {
  /** Peut dépasser 1 : c'est ici qu'on plafonne, pas dans le calcul. */
  ratio: number;
  tone?: ProgressTone;
  size?: 'md' | 'lg';
}) {
  const colors = useColors();

  const fillColor =
    tone === 'over'
      ? colors.danger
      : tone === 'warning'
        ? colors.warning
        : tone === 'positive'
          ? colors.positive
          : tone === 'muted'
            ? colors.textMuted
            : colors.primary;

  // Un remplissage nul à 0 % est juste ; au-delà, un filet de 2 % garde la barre lisible quand la part est minuscule. Elle sature à 100 % : le dépassement se lit dans le chiffre et la couleur, pas dans une barre qui déborderait de sa piste.
  const width: DimensionValue =
    ratio <= 0 ? 0 : `${Math.min(Math.max(ratio * 100, 2), 100)}%`;

  // Lue par TalkBack et VoiceOver comme une vraie jauge. Le mot du statut double la couleur, qu'un lecteur d'écran ne voit pas.
  const percent = Math.round(Math.max(ratio, 0) * 100);
  const statusWord =
    tone === 'over' ? ', dépassé' : tone === 'warning' ? ', proche du plafond' : '';

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.min(percent, 100), text: `${percent} %${statusWord}` }}
      style={[
        styles.track,
        size === 'lg' ? styles.trackLg : null,
        { backgroundColor: colors.surfaceMuted },
      ]}
    >
      <View style={[styles.fill, { width, backgroundColor: fillColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  trackLg: {
    height: 8,
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
});
