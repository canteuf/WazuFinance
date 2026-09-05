import type { CSSProperties } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dateToIso } from '@/lib/dates';
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
 * Variante web : `@react-native-community/datetimepicker` n'a pas
 * d'implémentation web (il ne rend rien, juste un avertissement en console),
 * donc on pose un vrai <input type="date"> du navigateur, invisible et
 * superposé à la ligne affichée — cliquer n'importe où dessus ouvre le
 * calendrier natif du navigateur, sans dépendre d'un état « ouvert ».
 */
export function DateField({ value, label, onChange, maximumDate }: DateFieldProps) {
  const colors = useColors();

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
      <input
        type="date"
        aria-label={`Date : ${label}`}
        value={value}
        max={dateToIso(maximumDate)}
        onChange={(event) => {
          // input[type=date] rend déjà du YYYY-MM-DD : pas besoin de repasser
          // par new Date(...), le piège de fuseau que isoToDate évite ailleurs.
          if (event.target.value) {
            onChange(event.target.value);
          }
        }}
        style={overlayStyle}
      />
    </View>
  );
}

const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  opacity: 0,
  cursor: 'pointer',
  border: 'none',
  padding: 0,
  margin: 0,
};

const styles = StyleSheet.create({
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    overflow: 'hidden',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 20,
  },
});
