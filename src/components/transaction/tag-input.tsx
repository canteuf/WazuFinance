import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { addTag, MAX_TAG_LENGTH, MAX_TAGS, tagSuggestions } from '@/lib/tags';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/**
 * Étiquettes d'une opération : celles choisies, retirées d'un toucher, un champ pour en taper une, et les étiquettes déjà utilisées dans le groupe à reprendre d'un toucher.
 *
 * Reprendre une suggestion plutôt que la retaper, c'est ce qui garde « Argent de Jean » identique d'une saisie à l'autre : le filtre de l'historique cherche l'étiquette exacte.
 */
export function TagInput({
  value,
  onChange,
  known,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Étiquettes déjà utilisées dans le groupe, les plus fréquentes d'abord. */
  known: string[];
}) {
  const colors = useColors();
  const [text, setText] = useState('');
  const full = value.length >= MAX_TAGS;
  const suggestions = full ? [] : tagSuggestions(known, value, text);

  function commit(raw: string) {
    onChange(addTag(value, raw, known));
    setText('');
  }

  return (
    <View style={styles.container}>
      {value.length > 0 ? (
        <View style={styles.row}>
          {value.map((tag) => (
            <Pressable
              key={tag}
              accessibilityRole="button"
              accessibilityLabel={`Étiquette ${tag}. Retirer`}
              onPress={() => onChange(value.filter((candidate) => candidate !== tag))}
              style={[styles.chip, { backgroundColor: colors.primary, borderColor: colors.primary }]}
            >
              <Text numberOfLines={1} style={[styles.chipLabel, { color: colors.primaryText }]}>
                {tag}
              </Text>
              <MaterialCommunityIcons name="close" size={16} color={colors.primaryText} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {full ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>Cinq étiquettes au plus.</Text>
      ) : (
        <View style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="tag-outline" size={20} color={colors.textMuted} />
          <TextInput
            accessibilityLabel="Ajouter une étiquette"
            placeholder="Ex : Argent de Jean, Rentrée 2027"
            placeholderTextColor={colors.textMuted}
            value={text}
            maxLength={MAX_TAG_LENGTH}
            onChangeText={(next) => {
              // Une virgule termine l'étiquette, comme la touche « Entrée » : c'est le geste qu'on tente d'instinct pour en saisir plusieurs.
              if (next.includes(',')) {
                commit(next.replace(/,/g, ''));
                return;
              }
              setText(next);
            }}
            onSubmitEditing={() => commit(text)}
            blurOnSubmit={false}
            returnKeyType="done"
            autoCapitalize="sentences"
            style={[styles.textInput, { color: colors.text }]}
          />
          {text.trim() !== '' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ajouter l’étiquette ${text.trim()}`}
              hitSlop={12}
              onPress={() => commit(text)}
            >
              <MaterialCommunityIcons name="plus-circle" size={22} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
      )}

      {suggestions.length > 0 ? (
        <View style={styles.row}>
          {suggestions.map((tag) => (
            <Pressable
              key={tag}
              accessibilityRole="button"
              accessibilityLabel={`Ajouter l’étiquette ${tag}`}
              onPress={() => commit(tag)}
              style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="plus" size={16} color={colors.textMuted} />
              <Text numberOfLines={1} style={[styles.chipLabel, { color: colors.text }]}>
                {tag}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    maxWidth: '100%',
  },
  chipLabel: {
    fontFamily: font.semibold,
    fontSize: 15,
    flexShrink: 1,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    // Mêmes mesures que le champ de note juste au-dessus, dans le formulaire de saisie.
    gap: spacing.sm + 2,
    minHeight: 54,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  textInput: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 16,
    paddingVertical: spacing.sm,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 15,
  },
});
