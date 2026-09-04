import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Category } from '@/data/categories';
import { radius, spacing, useColors } from '@/theme/tokens';

type CategoryPickerProps = {
  categories: Category[];
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
};

export function CategoryPicker({ categories, selectedId, onSelect }: CategoryPickerProps) {
  const colors = useColors();

  return (
    <View style={styles.grid}>
      {categories.map((category) => {
        const selected = category.id === selectedId;
        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={category.name}
            onPress={() => onSelect(category.id)}
            style={[
              styles.item,
              {
                backgroundColor: selected ? colors.primary : colors.surface,
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}
          >
            <MaterialCommunityIcons
              // Le nom vient de la base ; @expo/vector-icons le type de façon
              // stricte, d'où la conversion explicite.
              name={category.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
              size={22}
              color={selected ? colors.primaryText : colors.text}
            />
            <Text
              numberOfLines={1}
              style={[styles.label, { color: selected ? colors.primaryText : colors.textMuted }]}
            >
              {category.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  item: {
    width: 84,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
