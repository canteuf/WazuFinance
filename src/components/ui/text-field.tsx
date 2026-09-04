import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { radius, spacing, useColors } from '@/theme/tokens';

type TextFieldProps = TextInputProps & {
  label: string;
  errorText?: string;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, errorText, style, ...inputProps },
  ref
) {
  const colors = useColors();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: errorText ? colors.danger : colors.border,
            color: colors.text,
          },
          style,
        ]}
        {...inputProps}
      />
      {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 4,
    fontSize: 16,
  },
  error: {
    fontSize: 12,
  },
});
