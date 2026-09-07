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
 * Chaque tuile porte la couleur de sa catégorie, pas l'accent générique de
 * l'app : sélectionnée, elle se remplit de sa propre teinte. C'est ce qui rend
 * la couleur reconnaissable d'un écran à l'autre plutôt que décorative.
 *
 * Les dimensions suivent l'échelle de police du système. Avec la largeur fixe
 * d'avant, un libellé de 11 px porté à 22 px à 200 % débordait de la tuile et
 * se faisait tronquer — « Remboursement » devenait illisible. Deux tuiles par
 * ligne valent mieux qu'un libellé coupé : qui règle son téléphone à 200 % en
 * a besoin.
 */
export function CategoryPicker({ categories, selectedId, onSelect }: CategoryPickerProps) {
  const colors = useColors();
  const isDark = useIsDark();
  // useWindowDimensions() re-rend quand le réglage système change, à la
  // différence de PixelRatio.getFontScale(), lu une fois pour toutes.
  const { fontScale } = useWindowDimensions();

  const itemWidth = 84 * fontScale;
  const iconSize = 22 * fontScale;
  const badgeSize = 15 * fontScale;

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
                width: itemWidth,
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
                size={badgeSize}
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
              size={iconSize}
              color={selected ? colors.surface : tone.tint}
            />
            <Text
              // Deux lignes plutôt qu'une : filet de sécurité pour les libellés
              // les plus longs du seed (« Remboursement », « Autres revenus »)
              // aux échelles où même une tuile élargie ne suffit plus.
              numberOfLines={2}
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
    textAlign: 'center',
  },
});
