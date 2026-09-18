import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';

import { font, radius, spacing, useColors, useIsDark } from '@/theme/tokens';

/** Ce que le badge annonce. Aligné sur `BudgetStatus`, plus un ton neutre. */
export type BadgeTone = 'ok' | 'warning' | 'over' | 'neutral';

const ICONS: Record<BadgeTone, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  ok: 'check-circle-outline',
  warning: 'alert-outline',
  over: 'alert-circle-outline',
  neutral: 'information-outline',
};

/**
 * Pastille d'état : un fond teinté, une icône, un mot.
 *
 * L'icône double la couleur, elle ne la décore pas — une coche se distingue d'un triangle d'alerte là où deux aplats se ressemblent. Le texte dit la même chose une troisième fois, ce que lit aussi un lecteur d'écran.
 *
 * Les fonds sont composés ici plutôt qu'ajoutés aux jetons : ce sont des teintes dérivées d'une couleur sémantique, utiles à ce seul composant, et les porter dans `Colors` obligerait chaque thème à en déclarer trois de plus.
 */
export function StatusBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  const colors = useColors();
  const isDark = useIsDark();

  const tint =
    tone === 'over'
      ? colors.danger
      : tone === 'warning'
        ? colors.warning
        : tone === 'ok'
          ? colors.positive
          : colors.textMuted;

  // En Nocturne, un aplat clair derrière un texte clair perdrait son contraste : le fond reste sombre et c'est le texte qui porte la couleur. En Carnet, l'aplat pâle suffit et garde la pastille lisible de loin.
  const surface = isDark ? colors.surfaceMuted : `${tint}1A`;

  return (
    <View style={[styles.badge, { backgroundColor: surface }]}>
      <MaterialCommunityIcons name={ICONS[tone]} size={13} color={tint} />
      <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm + 1,
    borderRadius: radius.pill,
    // Cède la largeur au reste de la rangée plutôt que de la pousser dehors.
    flexShrink: 1,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 11,
    lineHeight: 14,
    flexShrink: 1,
  },
});
