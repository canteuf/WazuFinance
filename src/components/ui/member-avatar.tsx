import { Image, StyleSheet, Text, View } from 'react-native';

import { AVATAR_SOURCES } from '@/components/ui/avatar-sources';
import { parseAvatarId } from '@/lib/avatars';
import { initials, toneIndex, type MemberIdentity } from '@/lib/members';
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

/**
 * Pastille ronde d'un membre : son avatar s'il en a choisi un, sinon les initiales de son nom. Ronde : dans l'app, le rond désigne une personne.
 *
 * `avatar` est la valeur brute de `users.avatar`, pas un identifiant déjà validé : une valeur que cette version ne connaît pas donne les initiales.
 */
export function MemberAvatar({
  name,
  avatar,
  size = 32,
  ring,
}: {
  name: string;
  avatar?: string | null;
  size?: number;
  /** Couleur d'un liseré de détourage, pour les pastilles qui se chevauchent dans une pile. */
  ring?: string;
}) {
  const colors = useColors();
  const tones = palette(colors, useIsDark());
  const tone = tones[toneIndex(name, tones.length)];
  const avatarId = parseAvatarId(avatar);

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          // Les visages sont dessinés sur fond transparent : un fond neutre et stable, pas la teinte dérivée du nom, qui irait jusqu'au vert vif de l'accent et écraserait les traits.
          backgroundColor: avatarId ? colors.surfaceMuted : tone.background,
          borderColor: ring ?? 'transparent',
          borderWidth: ring ? 2 : 0,
        },
      ]}
    >
      {avatarId ? (
        <Image
          source={AVATAR_SOURCES[avatarId]}
          // Remplit la zone intérieure, liseré exclu : une taille fixe déborderait de la pastille dès qu'elle en a un. Décoratif : le nom est dit sur la même ligne.
          style={styles.image}
          fadeDuration={0}
          accessible={false}
        />
      ) : (
        <Text
          // L'initiale d'une pastille ne grossit pas avec la police système : son conteneur a une taille fixe, et un « CM » agrandi en sortirait. Le nom complet est dit ailleurs sur la même ligne.
          maxFontSizeMultiplier={1}
          style={[styles.initials, { color: tone.text, fontSize: size * 0.38 }]}
        >
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

/**
 * Pile de pastilles qui se chevauchent, suivie d'un « +N » pour le reste.
 *
 * `total` vient du compte fait en base, pas de la longueur de `members`, qui s'arrête à trois : c'est lui qui dit combien il reste.
 */
export function AvatarStack({
  members,
  total,
  size = 30,
}: {
  members: MemberIdentity[];
  total: number;
  size?: number;
}) {
  const colors = useColors();
  const hidden = total - members.length;

  return (
    <View
      style={styles.stack}
      accessible
      accessibilityLabel={total === 1 ? '1 membre' : `${total} membres`}
    >
      {members.map((member, index) => (
        <View key={`${member.name}-${index}`} style={index > 0 ? { marginLeft: -size * 0.3 } : null}>
          <MemberAvatar name={member.name} avatar={member.avatar} size={size} ring={colors.surface} />
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
    // Rogne l'image carrée au rond.
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
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
