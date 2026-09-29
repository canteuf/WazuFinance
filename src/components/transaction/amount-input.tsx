import { StyleSheet, Text, TextInput, View } from 'react-native';

import { amountDigits, CURRENCY_SYMBOL, groupDigits } from '@/lib/money';
import { font, spacing, useColors } from '@/theme/tokens';

/** Voir le commentaire du composant : plafond propre à ce champ. */
const MAX_FONT_SCALE = 1.4;

type AmountInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  autoFocus?: boolean;
};

/**
 * Montant en gros caractères, focalisé à l'ouverture de la feuille.
 *
 * Pas de pavé numérique maison : number-pad fait apparaître le clavier système sans tap dédié, ce qui sert directement la contrainte des trois taps.
 *
 * `value` et `onChangeText` portent des chiffres nus (« 150000 »), que parseAmount lit ; le champ les affiche groupés par milliers (« 150 000 »), et retire les espaces à chaque frappe.
 *
 * Seul endroit de l'app où l'échelle de police système est plafonnée. Ailleurs on élargit le conteneur, mais ici la largeur disponible est celle de l'écran : à 200 %, « 1 500,00 » passait à 92 px et débordait. Le plafond reste sans effet en dessous de 140 % ; au-delà, ce champ est déjà trois fois la taille du corps de texte, donc lisible même sans suivre toute l'échelle.
 */
export function AmountInput({ value, onChangeText, autoFocus = false }: AmountInputProps) {
  const colors = useColors();

  return (
    <View style={styles.row}>
      <TextInput
        accessibilityLabel="Montant"
        autoFocus={autoFocus}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder="0"
        placeholderTextColor={colors.textMuted}
        value={groupDigits(value)}
        onChangeText={(text) => onChangeText(amountDigits(text))}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[styles.input, { color: colors.text }]}
      />
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[styles.currency, { color: colors.textMuted }]}
      >
        {CURRENCY_SYMBOL}
      </Text>
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
    // La famille porte la graisse : avec une police chargée fichier par fichier, fontWeight déclencherait un gras synthétique.
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
