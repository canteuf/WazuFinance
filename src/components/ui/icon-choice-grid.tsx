import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { iconGridLayout } from '@/lib/icon-grid';
import { radius, spacing, useColors } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type IconChoiceGridProps = {
  options: { name: IconName; label: string }[];
  selected: string;
  onSelect: (name: IconName) => void;
  accessibilityLabel: string;
};

const GAP = spacing.sm;
/** Cible tactile minimale d'une tuile. */
const MIN_TILE = 44;

/**
 * Choix d'une icône parmi une liste courte, en grille qui occupe toute la largeur disponible : le nombre de colonnes et la taille des tuiles viennent de iconGridLayout(), selon la largeur mesurée.
 */
export function IconChoiceGrid({ options, selected, onSelect, accessibilityLabel }: IconChoiceGridProps) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  // Largeur réelle mesurée au premier rendu ; en attendant, une estimation proche (l'écran moins les marges d'un formulaire), corrigée à l'image suivante.
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const width = measuredWidth ?? windowWidth - 4 * spacing.md;

  const { columns, tileSize } = useMemo(
    () => iconGridLayout({ count: options.length, width, gap: GAP, minTile: MIN_TILE }),
    [options.length, width]
  );
  const iconSize = Math.round(Math.min(Math.max(tileSize * 0.45, 20), 28));

  const rows = useMemo(() => {
    const result: (typeof options)[] = [];
    for (let index = 0; index < options.length; index += columns) {
      result.push(options.slice(index, index + columns));
    }
    return result;
  }, [options, columns]);

  return (
    <View
      style={styles.grid}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
    >
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((option) => {
            const isSelected = option.name === selected;
            return (
              <Pressable
                key={option.name}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={option.label}
                onPress={() => onSelect(option.name)}
                style={[
                  styles.tile,
                  {
                    width: tileSize,
                    height: tileSize,
                    backgroundColor: isSelected ? colors.primary : colors.surfaceMuted,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={option.name}
                  size={iconSize}
                  color={isSelected ? colors.primaryText : colors.primary}
                />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: GAP,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  tile: {
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
