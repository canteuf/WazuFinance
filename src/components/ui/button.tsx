import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { font, radius, spacing, useColors } from '@/theme/tokens';

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
};

export function Button({ title, variant = 'primary', loading = false, disabled, ...rest }: ButtonProps) {
  const colors = useColors();
  const isDisabled = disabled === true || loading;
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  // primary et danger sont tous deux des fonds pleins avec du texte clair ;
  // seule la couleur de fond change entre confirmation neutre et destructive.
  const isSolid = isPrimary || isDanger;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        isPrimary && { backgroundColor: colors.primary },
        isDanger && { backgroundColor: colors.danger },
        (pressed || isDisabled) && styles.dimmed,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isSolid ? colors.primaryText : colors.primary} />
      ) : (
        <Text style={[styles.label, { color: isSolid ? colors.primaryText : colors.primary }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.6,
  },
  label: {
    fontFamily: font.bold,
    fontSize: 15.5,
    letterSpacing: -0.1,
  },
});
