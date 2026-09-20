import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Category } from '@/data/categories';
import {
  categoryGridLayout,
  ICON_SIZE,
  LABEL_FONT_SIZE,
  TILE_INNER_GAP,
  TILE_PADDING_H,
} from '@/lib/category-grid';
import { categoryTone } from '@/theme/category-colors';
import { font, radius, spacing, useColors, useIsDark } from '@/theme/tokens';

type CategoryPickerProps = {
  categories: Category[];
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
};

/**
 * Grille de catégories, disposée comme la maquette « Nouvelle écriture » : deux tuiles en tête, puis des rangées de trois, colonnes alignées. Le nombre de colonnes et la place de l'icône viennent de categoryGridLayout(), selon la largeur mesurée, l'échelle de police et le plus long mot à afficher.
 *
 * Chaque tuile porte la couleur de sa catégorie, pas l'accent générique de l'app : sélectionnée, elle se remplit de sa propre teinte. C'est ce qui rend la couleur reconnaissable d'un écran à l'autre plutôt que décorative.
 *
 * Les dimensions suivent l'échelle de police du système. Avec la largeur fixe d'avant, un libellé de 11 px porté à 22 px à 200 % débordait de la tuile et se faisait tronquer — « Remboursement » devenait illisible. Moins de tuiles par ligne valent mieux qu'un libellé coupé : qui règle son téléphone à 200 % en a besoin.
 *
 * La grille se cale sur une estimation au caractère, que la fonte réellement chargée dément parfois de quelques points ; le libellé ramène donc sa propre garantie, par adjustsFontSizeToFit, pour qu'un mot ne soit jamais coupé en deux.
 */
export function CategoryPicker({ categories, selectedId, onSelect }: CategoryPickerProps) {
  const colors = useColors();
  const isDark = useIsDark();
  // useWindowDimensions() re-rend quand le réglage système change, à la différence de PixelRatio.getFontScale(), lu une fois pour toutes.
  const { width: windowWidth, fontScale } = useWindowDimensions();
  // Largeur réelle mesurée au premier rendu ; en attendant, l'écran moins les marges de Screen, pour que la toute première image soit déjà la bonne sur un téléphone.
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const width = measuredWidth ?? windowWidth - 2 * spacing.lg;

  const iconSize = ICON_SIZE * Math.min(fontScale, 1.5);

  const rows = useMemo(
    () =>
      categoryGridLayout({
        labels: categories.map((category) => category.name),
        width,
        gap: GAP,
        fontScale,
      }),
    [categories, width, fontScale]
  );

  return (
    <View
      style={styles.grid}
      onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
    >
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.slots.map((slot, slotIndex) => {
            if (slot === null) {
              // Case vide : garde les colonnes de la dernière rangée alignées sur celles du dessus.
              return <View key={`empty-${slotIndex}`} style={styles.cell} />;
            }

            const category = categories[slot];
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
                  styles.cell,
                  styles.item,
                  row.iconAbove ? styles.itemStacked : styles.itemInline,
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
                  size={iconSize}
                  color={selected ? colors.surface : tone.tint}
                />
                {/* Deux lignes au plus : un nom de plusieurs mots passe à la ligne entre deux mots, et categoryGridLayout() réduit les colonnes avant qu'un mot seul ne tienne plus.

                    adjustsFontSizeToFit rattrape le cas que l'estimation ne peut pas trancher : categoryGridLayout() calcule la largeur d'un libellé au caractère près, et sur un mot long comme « Remboursement » l'écart avec la fonte réellement chargée suffit à faire retenir une colonne de trop. Le mot se faisait alors couper en plein milieu — un mot seul n'a pas d'espace où se replier sur la seconde ligne. Plutôt que de durcir le seuil, ce qui coûterait une colonne à tous les autres libellés, la tuile réduit ce seul mot de 15 % au plus. */}
                <Text
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={[
                    styles.label,
                    row.iconAbove && styles.labelStacked,
                    { color: selected ? colors.surface : colors.text },
                  ]}
                >
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const GAP = spacing.sm;

const styles = StyleSheet.create({
  grid: {
    gap: GAP,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  // Largeur égale pour chaque case d'une rangée, tuile ou case vide : c'est ce qui aligne les colonnes.
  cell: {
    flex: 1,
    flexBasis: 0,
  },
  item: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: TILE_PADDING_H,
    borderWidth: StyleSheet.hairlineWidth * 2,
    // Le rayon des petites puces du système, comme les badges de catégorie de l'historique.
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  itemInline: {
    flexDirection: 'row',
    gap: TILE_INNER_GAP,
  },
  itemStacked: {
    flexDirection: 'column',
    gap: spacing.xs,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: LABEL_FONT_SIZE,
    flexShrink: 1,
  },
  labelStacked: {
    textAlign: 'center',
  },
});
