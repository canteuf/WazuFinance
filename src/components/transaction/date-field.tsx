import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { dateToIso, isoToDate } from '@/lib/dates';
import { radius, spacing, useColors } from '@/theme/tokens';

export type DateFieldProps = {
  /** Date choisie, au format ISO `YYYY-MM-DD`. */
  value: string;
  /** Texte déjà formaté à afficher (« Aujourd'hui », « Hier », ...). */
  label: string;
  onChange: (iso: string) => void;
  /** Borne haute du sélecteur : pas d'opération future dans un suivi de dépenses. */
  maximumDate: Date;
};

/**
 * Variante native (iOS/Android) : un appui ouvre le sélecteur de date natif
 * dans une modale gérée par `@react-native-community/datetimepicker`, qui
 * n'a pas d'équivalent web — voir date-field.web.tsx pour ce cas.
 */
export function DateField({ value, label, onChange, maximumDate }: DateFieldProps) {
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
    fontSize: 15,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 20,
  },
});
