import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font, radius, spacing, useColors } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon: IconName;
};

/**
 * Deux ou trois choix exclusifs dans une pilule, le choix courant plein et sombre — le sélecteur Dépense / Revenu de la saisie, repris pour Verser / Retirer et Augmenter / Réduire.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const colors = useColors();

  return (
    <View accessibilityRole="radiogroup" style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
      {options.map((option) => {
        const selected = option.value === value;
        const foreground = selected ? colors.primaryText : colors.textMuted;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name={option.icon} size={18} color={foreground} />
            <Text style={[styles.label, { color: foreground }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radius.pill,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 46,
    borderRadius: radius.pill,
  },
  label: {
    fontFamily: font.bold,
    fontSize: 17,
  },
});
