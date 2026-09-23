import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MemberAvatar } from '@/components/ui/member-avatar';
import { AVATAR_IDS, type AvatarId } from '@/lib/avatars';
import { radius, spacing, useColors } from '@/theme/tokens';

/** Case tactile de 64 points : au-dessus des 44 minimums, et un visage n'a pas besoin de plus petit. */
const TILE = 64;
const RING = 2;
const INSET = 3;
const FACE = TILE - 2 * (RING + INSET);

/**
 * Grille de choix de l'avatar : les initiales du nom d'abord, puis les visages dans l'ordre de `AVATAR_IDS`.
 *
 * Les initiales sont montrées telles qu'elles apparaîtraient — même pastille, même teinte que pour les autres membres — plutôt que par une icône : c'est ce qu'on retrouve en revenant en arrière.
 *
 * Un seul choix à la fois, annoncé comme un groupe radio. `disabled` pendant l'enregistrement : un second appui partirait avant que le premier ne soit revenu.
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
  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.grid, disabled && styles.disabled]}
    >
      <Tile label="Initiales" selected={value === null} disabled={disabled} onPress={() => onSelect(null)}>
        <MemberAvatar name={name} size={FACE} />
      </Tile>
      {AVATAR_IDS.map((id, index) => (
        <Tile
          key={id}
          label={`Avatar ${index + 1}`}
          selected={value === id}
          disabled={disabled}
          onPress={() => onSelect(id)}
        >
          <MemberAvatar name={name} avatar={id} size={FACE} />
        </Tile>
      ))}
    </View>
  );
}

function Tile({
  label,
  selected,
  disabled,
  onPress,
  children,
}: {
  label: string;
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
      style={[styles.tile, { borderColor: selected ? colors.primary : 'transparent' }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  disabled: {
    opacity: 0.6,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.pill,
    borderWidth: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
