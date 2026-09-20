import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useColors, useElevation } from '@/theme/tokens';

/**
 * Surface de niveau 1 : le feuillet posé sur le fond « Carnet ».
 *
 * Trois endroits répétaient les mêmes quatre lignes (fond, rayon, ombre, liseré en Nocturne) et les valeurs de rayon avaient déjà commencé à diverger. Une seule définition les tient ensemble.
 *
 * `flush` retire le rembourrage pour les cartes qui portent une liste de rangées : ce sont alors les rangées qui rembourrent, sans quoi un séparateur ne pourrait pas courir d'un bord à l'autre.
 */
export function Card({
  children,
  flush = false,
  style,
}: {
  children: ReactNode;
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const elevation = useElevation();

  return (
    <View
      style={[
        styles.card,
        flush ? styles.flush : null,
        elevation.card,
        { backgroundColor: colors.surface },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  flush: {
    padding: 0,
    // Sans cela, une rangée pressée déborde des coins arrondis.
    overflow: 'hidden',
  },
});
