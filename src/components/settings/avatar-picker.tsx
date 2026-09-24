import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { MemberAvatar } from '@/components/ui/member-avatar';
import { AVATAR_IDS, type AvatarId } from '@/lib/avatars';
import { iconGridLayout } from '@/lib/icon-grid';
import { radius, spacing, useColors } from '@/theme/tokens';

/** Case tactile minimale : les 44 points recommandés, comme les grilles d'icônes. Plus haut, les dix-huit choix (initiales et dix-sept visages) ne tiennent pas en trois rangées de six sur la carte d'un téléphone, large d'environ 330 points. */
const MIN_TILE = 44;
const RING = 2;
const INSET = 3;
const GAP = spacing.sm;

/** Les initiales, puis chaque visage : `null` tient la place des initiales. */
const CHOICES: (AvatarId | null)[] = [null, ...AVATAR_IDS];

/**
 * Grille de choix de l'avatar : les initiales du nom d'abord, puis les visages dans l'ordre de `AVATAR_IDS`.
 *
 * Les initiales sont montrées telles qu'elles apparaîtraient — même pastille, même teinte que pour les autres membres — plutôt que par une icône : c'est ce qu'on retrouve en revenant en arrière.
 *
 * Un seul choix à la fois, annoncé comme un groupe radio. `disabled` pendant l'enregistrement : un second appui partirait avant que le premier ne soit revenu.
 *
 * Même disposition que IconChoiceGrid : des cases de taille fixe passées à la ligne laissaient un vide à droite de chaque rangée. Colonnes et taille des cases viennent de iconGridLayout(), selon la largeur mesurée ; le visage grandit avec sa case.
 */
export function AvatarPicker({
  name,
  value,
  onSelect,
  disabled = false,
}: {
  /** Nom affiché de l'utilisateur, dont on tire les initiales. */
  name: string;
  /** Avatar actuel ; `null` pour les initiales. */
  value: AvatarId | null;
  onSelect: (next: AvatarId | null) => void;
  disabled?: boolean;
}) {
  const { width: windowWidth } = useWindowDimensions();
  // Largeur réelle mesurée au premier rendu ; en attendant, une estimation proche (l'écran moins les marges de la carte), corrigée à l'image suivante.
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const width = measuredWidth ?? windowWidth - 4 * spacing.md;

  const { columns, tileSize } = useMemo(
    () => iconGridLayout({ count: CHOICES.length, width, gap: GAP, minTile: MIN_TILE }),
    [width]
  );
  const face = Math.floor(tileSize - 2 * (RING + INSET));

  const rows = useMemo(() => {
    const result: (AvatarId | null)[][] = [];
    for (let index = 0; index < CHOICES.length; index += columns) {
      result.push(CHOICES.slice(index, index + columns));
    }
    return result;
  }, [columns]);

  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.grid, disabled && styles.disabled]}
      onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
    >
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((id) =>
            id === null ? (
              <Tile
                key="initials"
                label="Initiales"
                size={tileSize}
                selected={value === null}
                disabled={disabled}
                onPress={() => onSelect(null)}
              >
                <MemberAvatar name={name} size={face} />
              </Tile>
            ) : (
              <Tile
                key={id}
                label={`Avatar ${AVATAR_IDS.indexOf(id) + 1}`}
                size={tileSize}
                selected={value === id}
                disabled={disabled}
                onPress={() => onSelect(id)}
              >
                <MemberAvatar name={name} avatar={id} size={face} />
              </Tile>
            )
          )}
        </View>
      ))}
    </View>
  );
}

function Tile({
  label,
  size,
  selected,
  disabled,
  onPress,
  children,
}: {
  label: string;
  size: number;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.tile,
        { width: size, height: size, borderColor: selected ? colors.primary : 'transparent' },
      ]}
    >
      {children}
    </Pressable>
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
  disabled: {
    opacity: 0.6,
  },
  tile: {
    borderRadius: radius.pill,
    borderWidth: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
