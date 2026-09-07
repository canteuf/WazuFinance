import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Category } from '@/data/categories';
import { categoryTone } from '@/theme/category-colors';
import { font, radius, spacing, useColors, useIsDark } from '@/theme/tokens';

type CategoryPickerProps = {
  categories: Category[];
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
};

/**
 * Grille de catégories.
 *
 * Chaque tuile porte la couleur de sa catégorie, pas l'accent générique de
 * l'app : sélectionnée, elle se remplit de sa propre teinte. C'est ce qui rend
 * la couleur reconnaissable d'un écran à l'autre plutôt que décorative.
 */
export function CategoryPicker({ categories, selectedId, onSelect }: CategoryPickerProps) {
  const colors = useColors();
  const isDark = useIsDark();

  return (
    <View style={styles.grid}>
      {categories.map((category) => {
        const selected = category.id === selectedId;
        const tone = categoryTone(category, isDark);

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
                backgroundColor: selected ? tone.tint : tone.surface,
                borderColor: selected ? tone.tint : 'transparent',
              },
            ]}
          >
            {selected ? (
              // La sélection ne doit pas reposer sur la seule couleur : ce badge
              // donne un repère de forme, indépendant du sens de la couleur.
              <MaterialCommunityIcons
                name="check-circle"
                size={15}
                color={colors.surface}
                style={styles.badge}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            ) : null}

            <MaterialCommunityIcons
              // Le nom vient de la base ; @expo/vector-icons le type de façon
              // stricte, d'où la conversion explicite.
              name={category.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
              size={22}
              color={selected ? colors.surface : tone.tint}
            />
            <Text
              numberOfLines={1}
              style={[styles.label, { color: selected ? colors.surface : colors.textMuted }]}
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
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.sm + 3,
    alignItems: 'center',
    gap: spacing.xs,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 3,
    right: 3,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 11,
  },
});
