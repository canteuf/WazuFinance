import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { CalendarSheet } from '@/components/transaction/calendar-sheet';
import type { DateFieldProps } from '@/components/transaction/date-field-props';
import { font, radius, spacing, useColors } from '@/theme/tokens';

export type { DateFieldProps };

/**
 * Variante native (iOS/Android) : un appui ouvre CalendarSheet, le calendrier aux couleurs de l'app. La boîte de dialogue de `@react-native-community/datetimepicker` qu'il remplace prenait le bleu du thème Android, réglable seulement au build natif. Le web garde le calendrier du navigateur — voir date-field.web.tsx.
 */
export function DateField({ value, label, onChange, maximumDate, minimumDate }: DateFieldProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Date : ${label}`}
        onPress={() => setOpen(true)}
        style={[styles.row, { backgroundColor: colors.surfaceMuted, borderColor: colors.inputBorder }]}
      >
        <MaterialCommunityIcons name="calendar-month-outline" size={20} color={colors.primary} />
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.action, { color: colors.textMuted }]}>Modifier</Text>
      </Pressable>

      <CalendarSheet
        visible={open}
        value={value}
        maximumDate={maximumDate}
        minimumDate={minimumDate}
        onSelect={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 54,
  },
  label: {
    flex: 1,
    fontFamily: font.bold,
    fontSize: 17,
  },
  action: {
    fontFamily: font.semibold,
    fontSize: 15,
  },
});
