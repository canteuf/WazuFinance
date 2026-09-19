import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState, type CSSProperties } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DateFieldProps } from '@/components/transaction/date-field-props';
import { dateToIso } from '@/lib/dates';
import { font, radius, spacing, useColors } from '@/theme/tokens';

export type { DateFieldProps };

/**
 * Variante web : `@react-native-community/datetimepicker` n'a pas d'implémentation web (il ne rend rien, juste un avertissement en console), donc on pose un vrai <input type="date"> du navigateur, invisible et superposé à la ligne affichée — cliquer n'importe où dessus ouvre le calendrier natif du navigateur, sans dépendre d'un état « ouvert ».
 */
export function DateField({ value, label, onChange, maximumDate, minimumDate }: DateFieldProps) {
  const colors = useColors();
  // L'input superposé est en opacity 0 : sans cet état, un utilisateur clavier voyant n'a aucun repère de focus sur la rangée visible.
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.surfaceMuted, borderColor: focused ? colors.primary : colors.border },
      ]}
    >
      <MaterialCommunityIcons name="calendar-month-outline" size={20} color={colors.primary} />
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.action, { color: colors.textMuted }]}>Modifier</Text>
      <input
        type="date"
        aria-label={`Date : ${label}`}
        value={value}
        max={maximumDate ? dateToIso(maximumDate) : undefined}
        min={minimumDate ? dateToIso(minimumDate) : undefined}
        onChange={(event) => {
          // input[type=date] rend déjà du YYYY-MM-DD : pas besoin de repasser par new Date(...), le piège de fuseau que isoToDate évite ailleurs.
          if (event.target.value) {
            onChange(event.target.value);
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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
    gap: spacing.sm + 2,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 54,
    overflow: 'hidden',
  },
  label: {
    flex: 1,
    fontFamily: font.bold,
    fontSize: 15,
  },
  action: {
    fontFamily: font.semibold,
    fontSize: 13,
  },
});
