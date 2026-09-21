import type { ReactNode } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';

/** Rang au-delà duquel le retard cesse de croître : sans ce plafond, la quarantième ligne d'une longue liste attendrait plus d'une seconde avant d'apparaître. */
const MAX_STAGGERED_INDEX = 6;
const STAGGER_MS = 40;
const DURATION_MS = 250;

/**
 * Entrée d'une ligne de liste en fondu et légère descente, décalée selon son rang pour que la liste se déploie au lieu d'apparaître d'un bloc.
 *
 * Réservé aux listes non virtualisées. `entering` se joue à chaque montage : dans une `FlatList` ou une `SectionList`, les lignes se montent au fil du défilement et de la pagination, et chacune rejouerait l'animation sous le doigt. L'historique et le journal d'activité n'en ont donc pas.
 *
 * Reanimated suit par défaut le réglage « réduire les animations » du système (`ReduceMotion.System`) : rien à gérer ici pour qui l'a activé.
 */
export function FadeInRow({ index, children }: { index: number; children: ReactNode }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, MAX_STAGGERED_INDEX) * STAGGER_MS).duration(DURATION_MS)}
    >
      {children}
    </Animated.View>
  );
}
