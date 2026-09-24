import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { INVITATION_CODE_LENGTH, sanitizeInvitationCodeInput } from '@/lib/invitation-code';
import { font, radius, spacing, stackAtFontScale, useColors, useElevation } from '@/theme/tokens';

const HALF = INVITATION_CODE_LENGTH / 2;

type InvitationCodeInputProps = {
  /** Code à la forme stockée : minuscules, sans tiret, huit caractères au plus. */
  value: string;
  onChangeText: (code: string) => void;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
  invalid?: boolean;
};

/**
 * Saisie du code d'invitation en huit cases, quatre puis un tiret puis quatre, comme le code s'affiche chez le propriétaire.
 *
 * Un seul `TextInput`, invisible, étendu sur toute la rangée, et huit cases qui ne font que le dessiner. Huit champs distincts obligeraient à déplacer le focus à chaque caractère et à chaque effacement, et casseraient le collage d'un code entier : le clavier natif ne sait coller que dans un seul champ. Le champ invisible reçoit les touchers, le collage par appui long et le lecteur d'écran.
 */
export const InvitationCodeInput = forwardRef<TextInput, InvitationCodeInputProps>(
  function InvitationCodeInput({ value, onChangeText, onSubmitEditing, autoFocus, invalid }, ref) {
    const colors = useColors();
    const elevation = useElevation();
    const { fontScale } = useWindowDimensions();
    const [focused, setFocused] = useState(false);

    // À forte échelle de police, huit cases de front deviennent plus étroites que leur caractère : les deux groupes s'empilent au lieu de brider la taille du texte.
    const stacked = fontScale >= stackAtFontScale;
    // La case active est la prochaine à remplir ; une fois le code complet, la dernière reste marquée, puisque l'effacement part d'elle.
    const activeIndex = focused ? Math.min(value.length, INVITATION_CODE_LENGTH - 1) : -1;

    function renderBox(index: number) {
      const active = index === activeIndex;
      return (
        <View
          key={index}
          style={[
            styles.box,
            elevation.card,
            { backgroundColor: colors.surface },
            invalid ? { borderWidth: BORDER_WIDTH, borderColor: colors.danger } : null,
            active ? { borderWidth: BORDER_WIDTH, borderColor: colors.primary } : null,
          ]}
        >
          <Text style={[styles.char, { color: colors.text }]}>
            {value.charAt(index).toUpperCase()}
          </Text>
        </View>
      );
    }

    const boxes = Array.from({ length: INVITATION_CODE_LENGTH }, (_, index) => renderBox(index));

    return (
      <View style={[styles.row, stacked ? styles.rowStacked : null]}>
        <View style={styles.group}>{boxes.slice(0, HALF)}</View>
        {stacked ? null : (
          <Text style={[styles.dash, { color: colors.textMuted }]} importantForAccessibility="no">
            –
          </Text>
        )}
        <View style={styles.group}>{boxes.slice(HALF)}</View>

        <TextInput
          ref={ref}
          accessibilityLabel="Code d’invitation à 8 caractères"
          accessibilityHint="Chiffres de 0 à 9 et lettres de A à F"
          value={value}
          onChangeText={(text) => onChangeText(sanitizeInvitationCodeInput(text))}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocus}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          caretHidden
          // Le curseur reste en fin de code : les cases se remplissent et s'effacent dans l'ordre, sans insertion au milieu qu'elles ne sauraient pas montrer.
          selection={{ start: value.length, end: value.length }}
          returnKeyType="done"
          style={styles.hiddenInput}
        />
      </View>
    );
  }
);

/** Liseré de la case active ou en erreur : plus épais que celui des cartes en Nocturne, pour se lire comme un état et non comme un contour. */
const BORDER_WIDTH = 2;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  group: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  box: {
    flex: 1,
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  char: {
    fontFamily: font.bold,
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  dash: {
    fontFamily: font.bold,
    fontSize: 22,
  },
  // Présent et focalisable, mais sans rien peindre : une opacité nulle suffit, alors que `display: 'none'` ou une taille nulle retireraient le champ des touchers et du clavier.
  hiddenInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0,
    color: 'transparent',
  },
});
