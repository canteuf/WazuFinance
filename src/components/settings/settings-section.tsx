import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { font, radius, spacing, useColors } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Une rubrique de l'écran des paramètres : son intitulé en petites capitales, puis sa carte.
 *
 * `flush` pour les rubriques faites de rangées séparées par des filets, qui portent alors leur propre rembourrage. `danger` pour la seule zone irréversible : l'intitulé passe au rouge brique, pour qu'on la repère avant d'y entrer.
 */
export function SettingsSection({
  title,
  children,
  flush = false,
  tone = 'default',
}: {
  title: string;
  children: ReactNode;
  flush?: boolean;
  tone?: 'default' | 'danger';
}) {
  const colors = useColors();

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: tone === 'danger' ? colors.danger : colors.text }]}>
        {title}
      </Text>
      <Card flush={flush} style={flush ? null : styles.padded}>
        {children}
      </Card>
    </View>
  );
}

/** Filet entre deux rangées d'une rubrique `flush`, décalé des bords comme dans les autres listes de l'app. */
export function SettingsDivider() {
  const colors = useColors();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

/**
 * Rangée d'une rubrique : pastille d'icône, libellé, valeur, et à droite un chevron ou un badge.
 *
 * Pressable seulement quand `onPress` est fourni ; sans lui, la rangée est une information, et un chevron promettrait une action qui n'existe pas.
 */
export function SettingsRow({
  icon,
  label,
  value,
  subtitle,
  plainValue = false,
  trailing,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  /** Avec `value` : petit libellé au-dessus. Seul ou avec `subtitle` : titre en gras. */
  label: string;
  /** Une donnée — nom, email — sous son libellé. */
  value?: string;
  /** Une action décrite : le titre en gras, sa conséquence dessous. */
  subtitle?: string;
  /** Valeur en graisse normale, pour une donnée secondaire comme l'email. */
  plainValue?: boolean;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const colors = useColors();

  const content = (
    <>
      <View style={[styles.glyph, { backgroundColor: colors.surfaceMuted }]}>
        <MaterialCommunityIcons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.text}>
        {value !== undefined ? (
          <>
            <Text style={[styles.caption, { color: colors.textMuted }]}>{label}</Text>
            <Text
              style={[styles.value, plainValue && styles.plain, { color: colors.text }]}
              numberOfLines={1}
            >
              {value}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.value, { color: colors.text }]}>{label}</Text>
            {subtitle ? (
              <Text style={[styles.caption, { color: colors.textMuted }]}>{subtitle}</Text>
            ) : null}
          </>
        )}
      </View>
      {trailing ??
        (onPress ? (
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
        ) : null)}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (value ? `${label} : ${value}` : label)}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm + 2,
  },
  title: {
    fontFamily: font.semibold,
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  padded: {
    gap: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    marginHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  glyph: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  caption: {
    fontFamily: font.regular,
    fontSize: 15,
  },
  value: {
    fontFamily: font.bold,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  plain: {
    fontFamily: font.regular,
    letterSpacing: 0,
  },
});
