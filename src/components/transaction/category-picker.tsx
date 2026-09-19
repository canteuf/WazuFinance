import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

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
 * Chaque tuile porte la couleur de sa catégorie, pas l'accent générique de l'app : sélectionnée, elle se remplit de sa propre teinte. C'est ce qui rend la couleur reconnaissable d'un écran à l'autre plutôt que décorative.
 *
 * Les dimensions suivent l'échelle de police du système. Avec la largeur fixe d'avant, un libellé de 11 px porté à 22 px à 200 % débordait de la tuile et se faisait tronquer — « Remboursement » devenait illisible. Deux tuiles par ligne valent mieux qu'un libellé coupé : qui règle son téléphone à 200 % en a besoin.
 */
export function CategoryPicker({ categories, selectedId, onSelect }: CategoryPickerProps) {
  const colors = useColors();
  const isDark = useIsDark();
  // useWindowDimensions() re-rend quand le réglage système change, à la différence de PixelRatio.getFontScale(), lu une fois pour toutes.
  const { fontScale } = useWindowDimensions();

  // Pastilles horizontales à largeur de contenu, d'après la maquette : l'icône à gauche du nom plutôt qu'au-dessus. Plus de largeur fixe à dériver de l'échelle de police — la pastille s'élargit avec son libellé, et la grille passe à la ligne d'elle-même.
  const iconSize = 18 * Math.min(fontScale, 1.5);
  const badgeSize = 14 * Math.min(fontScale, 1.5);

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
            <MaterialCommunityIcons
              // Sélectionnée, l'icône de la catégorie cède la place à une coche : la sélection ne repose pas sur la seule couleur, et la coche donne un repère de forme.
              name={
                selected
                  ? 'check-circle'
                  : // Le nom vient de la base ; @expo/vector-icons le type de façon stricte, d'où la conversion explicite.
                    (category.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name'])
              }
              size={selected ? badgeSize + 4 : iconSize}
              color={selected ? colors.surface : tone.tint}
            />
            <Text
              numberOfLines={1}
              style={[styles.label, { color: selected ? colors.surface : colors.text }]}
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md - 2,
    borderWidth: StyleSheet.hairlineWidth * 2,
    // Le rayon des petites puces du système, comme les badges de catégorie de l'historique.
    borderRadius: radius.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 14,
    flexShrink: 1,
  },
});
