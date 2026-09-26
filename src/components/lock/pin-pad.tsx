import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { PIN_LENGTH } from '@/lib/app-lock';
import { font, radius, spacing, useColors } from '@/theme/tokens';

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

/**
 * Pavé de saisie du code : quatre points, puis douze touches.
 *
 * Un pavé dessiné plutôt qu'un champ texte et le clavier du téléphone : le clavier couvrirait la moitié de l'écran de verrouillage, et une touche de l'app peut porter l'empreinte à côté du 0.
 *
 * Contrôlé : le parent garde la valeur et décide quoi faire au quatrième chiffre (`onChange` reçoit la valeur complète).
 */
export function PinPad({
  value,
  onChange,
  disabled = false,
  onBiometric,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Affiche la touche empreinte en bas à gauche. */
  onBiometric?: () => void;
}) {
  const colors = useColors();
  const { fontScale } = useWindowDimensions();
  // Les touches grandissent avec la police système, jusqu'à ce que trois tiennent encore sur un petit téléphone.
  const keySize = Math.round(72 * Math.min(fontScale, 1.3));

  function press(digit: string) {
    if (disabled || value.length >= PIN_LENGTH) {
      return;
    }
    void Haptics.selectionAsync();
    onChange(value + digit);
  }

  function erase() {
    if (disabled || value.length === 0) {
      return;
    }
    void Haptics.selectionAsync();
    onChange(value.slice(0, -1));
  }

  const keyStyle = [
    styles.key,
    { width: keySize, height: keySize, borderRadius: keySize / 2, backgroundColor: colors.surface },
  ];

  return (
    <View style={styles.root}>
      <View
        accessible
        accessibilityLabel={`${value.length} chiffre${value.length > 1 ? 's' : ''} saisi${value.length > 1 ? 's' : ''} sur ${PIN_LENGTH}`}
        style={styles.dots}
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                borderColor: colors.textMuted,
                backgroundColor: index < value.length ? colors.text : 'transparent',
              },
            ]}
          />
        ))}
      </View>

      <View style={[styles.pad, disabled && styles.disabled]}>
        {ROWS.map((row) => (
          <View key={row[0]} style={styles.row}>
            {row.map((digit) => (
              <Pressable
                key={digit}
                accessibilityRole="button"
                accessibilityLabel={digit}
                accessibilityState={{ disabled }}
                onPress={() => press(digit)}
                style={({ pressed }) => [keyStyle, pressed && { backgroundColor: colors.surfaceMuted }]}
              >
                <Text style={[styles.digit, { color: colors.text }]}>{digit}</Text>
              </Pressable>
            ))}
          </View>
        ))}
        <View style={styles.row}>
          {onBiometric ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Utiliser l’empreinte ou le visage"
              onPress={onBiometric}
              style={({ pressed }) => [
                styles.key,
                { width: keySize, height: keySize, borderRadius: keySize / 2 },
                pressed && { backgroundColor: colors.surfaceMuted },
              ]}
            >
              <MaterialCommunityIcons name="fingerprint" size={32} color={colors.primary} />
            </Pressable>
          ) : (
            <View style={{ width: keySize, height: keySize }} />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="0"
            accessibilityState={{ disabled }}
            onPress={() => press('0')}
            style={({ pressed }) => [keyStyle, pressed && { backgroundColor: colors.surfaceMuted }]}
          >
            <Text style={[styles.digit, { color: colors.text }]}>0</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Effacer le dernier chiffre"
            onPress={erase}
            style={({ pressed }) => [
              styles.key,
              { width: keySize, height: keySize, borderRadius: keySize / 2 },
              pressed && { backgroundColor: colors.surfaceMuted },
            ]}
          >
            <MaterialCommunityIcons name="backspace-outline" size={26} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: spacing.xl,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  pad: {
    gap: spacing.md,
  },
  disabled: {
    opacity: 0.4,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  key: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    fontFamily: font.semibold,
    fontSize: 28,
  },
});
