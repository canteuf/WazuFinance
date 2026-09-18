import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { DateFieldProps } from '@/components/transaction/date-field-props';
import { dateToIso, isoToDate } from '@/lib/dates';
import { font, radius, spacing, useColors } from '@/theme/tokens';

export type { DateFieldProps };

/**
 * Variante native (iOS/Android) : un appui ouvre le sélecteur de date natif dans une modale gérée par `@react-native-community/datetimepicker`, qui n'a pas d'équivalent web — voir date-field.web.tsx pour ce cas.
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
        style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
      </Pressable>

      {open ? (
        <DateTimePicker
          value={isoToDate(value)}
          mode="date"
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={(_event, date) => {
            setOpen(false);
            if (date) {
              onChange(dateToIso(date));
            }
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 15,
  },
  chevron: {
    fontSize: 20,
  },
});
