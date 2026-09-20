import { StyleSheet, Text, View } from 'react-native';

import { initials, toneIndex } from '@/lib/members';
import { font, radius, useColors, useIsDark, type Colors } from '@/theme/tokens';

type Tone = { background: string; text: string };

/**
 * Teintes des pastilles de membres, dérivées des jetons plutôt que codées en dur : elles suivent Carnet et Nocturne comme le reste. En Carnet, un aplat dilué de la couleur ; en Nocturne, la surface neutre et le texte coloré, un aplat clair y perdant son contraste — même règle que StatusBadge.
 */
function palette(colors: Colors, isDark: boolean): Tone[] {
  const soft = (color: string): Tone => ({
    background: isDark ? colors.surfaceMuted : `${color}26`,
    text: color,
  });
  return [
    { background: colors.surfaceMuted, text: colors.text },
    soft(colors.positive),
    soft(colors.warning),
    { background: colors.primary, text: colors.primaryText },
    soft(colors.primary),
  ];
}

/** Pastille ronde aux initiales d'un membre. Ronde : dans l'app, le rond désigne une personne. */
export function MemberAvatar({
  name,
  size = 32,
  ring,
}: {
  name: string;
  size?: number;
  /** Couleur d'un liseré de détourage, pour les pastilles qui se chevauchent dans une pile. */
  ring?: string;
}) {
  const colors = useColors();
  const tones = palette(colors, useIsDark());
  const tone = tones[toneIndex(name, tones.length)];

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          backgroundColor: tone.background,
          borderColor: ring ?? 'transparent',
          borderWidth: ring ? 2 : 0,
        },
      ]}
    >
      <Text
        // L'initiale d'une pastille ne grossit pas avec la police système : son conteneur a une taille fixe, et un « CM » agrandi en sortirait. Le nom complet est dit ailleurs sur la même ligne.
        maxFontSizeMultiplier={1}
        style={[styles.initials, { color: tone.text, fontSize: size * 0.38 }]}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

/**
 * Pile de pastilles qui se chevauchent, suivie d'un « +N » pour le reste.
 *
 * `total` vient du compte fait en base, pas de la longueur de `names`, qui s'arrête à trois : c'est lui qui dit combien il reste.
 */
export function AvatarStack({
  names,
  total,
  size = 30,
}: {
  names: string[];
  total: number;
  size?: number;
}) {
  const colors = useColors();
  const hidden = total - names.length;

  return (
    <View
      style={styles.stack}
      accessible
      accessibilityLabel={total === 1 ? '1 membre' : `${total} membres`}
    >
      {names.map((name, index) => (
        <View key={`${name}-${index}`} style={index > 0 ? { marginLeft: -size * 0.3 } : null}>
          <MemberAvatar name={name} size={size} ring={colors.surface} />
        </View>
      ))}
      {hidden > 0 ? (
        <View
          style={[
            styles.avatar,
            styles.more,
            {
              width: size,
              height: size,
              marginLeft: -size * 0.3,
              backgroundColor: colors.surfaceMuted,
              borderColor: colors.surface,
            },
          ]}
        >
          <Text maxFontSizeMultiplier={1} style={[styles.moreLabel, { color: colors.textMuted }]}>
            +{hidden}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: font.bold,
  },
  stack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  more: {
    borderWidth: 2,
  },
  moreLabel: {
    fontFamily: font.semibold,
    fontSize: 13,
  },
});
