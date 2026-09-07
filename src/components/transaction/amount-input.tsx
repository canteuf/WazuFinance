import { StyleSheet, Text, TextInput, View } from 'react-native';

import { font, spacing, useColors } from '@/theme/tokens';

type AmountInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  autoFocus?: boolean;
};

/**
 * Montant en gros caractères, focalisé à l'ouverture de la feuille.
 *
 * Pas de pavé numérique maison : decimal-pad fait apparaître le clavier
 * système sans tap dédié, ce qui sert directement la contrainte des trois taps.
 */
export function AmountInput({ value, onChangeText, autoFocus = false }: AmountInputProps) {
  const colors = useColors();

  return (
    <View style={styles.row}>
      <TextInput
        accessibilityLabel="Montant"
        autoFocus={autoFocus}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="0,00"
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        style={[styles.input, { color: colors.text }]}
      />
      <Text style={[styles.currency, { color: colors.textMuted }]}>€</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  input: {
    // La famille porte la graisse : avec une police chargée fichier par
    // fichier, fontWeight déclencherait un gras synthétique.
    fontFamily: font.black,
    fontSize: 46,
    letterSpacing: -1.5,
    textAlign: 'right',
    minWidth: 120,
    fontVariant: ['tabular-nums'],
  },
  currency: {
    fontFamily: font.semibold,
    fontSize: 24,
  },
});
