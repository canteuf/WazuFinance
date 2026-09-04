import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { radius, spacing, useColors } from '@/theme/tokens';

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  variant?: 'primary' | 'ghost';
  loading?: boolean;
};

export function Button({ title, variant = 'primary', loading = false, disabled, ...rest }: ButtonProps) {
  const colors = useColors();
  const isDisabled = disabled === true || loading;
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        isPrimary && { backgroundColor: colors.primary },
        (pressed || isDisabled) && styles.dimmed,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.primaryText : colors.primary} />
      ) : (
        <Text style={[styles.label, { color: isPrimary ? colors.primaryText : colors.primary }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.6,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
