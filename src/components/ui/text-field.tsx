import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { forwardRef, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { font, radius, spacing, useColors } from '@/theme/tokens';

/** Durée pendant laquelle un mot de passe reste lisible après un toucher sur l'œil, avant de se masquer de lui-même. */
const REVEAL_DURATION_MS = 5000;
/** Largeur de la zone tactile de l'œil : le minimum recommandé, sur toute la hauteur du champ. */
const TOGGLE_WIDTH = 48;

type TextFieldProps = TextInputProps & {
  label: string;
  errorText?: string;
};

/**
 * Champ de saisie étiqueté. Un champ `secureTextEntry` reçoit un œil tout à droite : un toucher affiche le mot de passe et l'icône devient l'œil barré, un second le masque aussitôt. Sans second toucher, il se remasque seul après `REVEAL_DURATION_MS`.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, errorText, style, secureTextEntry, ...inputProps },
  ref
) {
  const colors = useColors();
  const isPassword = secureTextEntry === true;
  const [revealed, setRevealed] = useState(false);

  // Le minuteur vit dans l'effet : le nettoyage l'annule quand un second toucher masque le mot de passe avant l'échéance, ou quand le champ disparaît.
  useEffect(() => {
    if (!revealed) {
      return;
    }
    const timer = setTimeout(() => setRevealed(false), REVEAL_DURATION_MS);
    return () => clearTimeout(timer);
  }, [revealed]);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <View>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          // Un mot de passe affiché n'est plus un champ masqué pour le clavier : sans ces deux réglages, la barre de suggestions s'ouvrirait dessus et pourrait retenir ce qui y est saisi.
          autoCorrect={isPassword ? false : undefined}
          spellCheck={isPassword ? false : undefined}
          secureTextEntry={isPassword && !revealed}
          style={[
            styles.input,
            // Le texte s'arrête avant l'œil au lieu de passer dessous.
            isPassword ? styles.inputWithToggle : null,
            {
              backgroundColor: colors.surface,
              borderColor: errorText ? colors.danger : colors.border,
              color: colors.text,
            },
            style,
          ]}
          {...inputProps}
        />
        {isPassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${revealed ? 'Masquer' : 'Afficher'} le mot de passe (${label})`}
            onPress={() => setRevealed((value) => !value)}
            style={({ pressed }) => [styles.toggle, { opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialCommunityIcons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
      {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs + 2,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 15,
  },
  input: {
    fontFamily: font.medium,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    fontSize: 18,
  },
  inputWithToggle: {
    paddingRight: TOGGLE_WIDTH,
  },
  // Calé sur la hauteur du champ plutôt que sur une valeur fixe : à forte échelle de police, le champ grandit et la zone tactile le suit.
  toggle: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: TOGGLE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontFamily: font.medium,
    fontSize: 14,
  },
});
