import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { CONTENT_GUTTER, contentColumn } from '@/components/ui/screen';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { goBackOr } from '@/lib/navigation';
import { GROUP_NAME_MAX_LENGTH } from '@/lib/validation';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/** Créer un groupe partagé (spec section 1, écran 7). formSheet, un seul champ. */
export default function GroupCreateScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setActiveGroupId } = useActiveGroup();
  const { createGroup, isCreating } = useGroupMutations();
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [errorText, setErrorText] = useState<string>();

  const valid = name.trim() !== '';

  function handleSubmit() {
    setTouched(true);
    setErrorText(undefined);
    if (!valid) {
      return;
    }
    createGroup.mutate(name.trim(), {
      onSuccess: (groupId) => {
        // Le groupe qu'on vient de créer devient le groupe actif : sinon l'utilisateur resterait sur son compte personnel sans comprendre où est passé le groupe qu'il vient de créer.
        setActiveGroupId(groupId);
        goBackOr(router, '/groups');
      },
      onError: (error) => setErrorText(dataErrorMessage(error)),
    });
  }

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Créer un groupe partagé</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          hitSlop={spacing.sm}
          onPress={() => goBackOr(router, '/groups')}
          style={styles.closeButton}
        >
          <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.form}>
        <TextInput
          accessibilityLabel="Nom du groupe"
          placeholder="Coloc, Famille…"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          maxLength={GROUP_NAME_MAX_LENGTH}
          autoFocus
          style={[
            styles.name,
            { backgroundColor: colors.surface, borderColor: colors.inputBorder, color: colors.text },
          ]}
        />

        {touched && !valid ? (
          <Text style={[styles.error, { color: colors.danger }]}>Donnez un nom au groupe.</Text>
        ) : null}
        {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

        <Button title="Créer" loading={isCreating} onPress={handleSubmit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    // Le fond garde la pleine largeur de la feuille ; ce sont les blocs qui se centrent, sur la même colonne que les écrans (voir `contentColumn`). Sans cela, le contenu d'une feuille s'étalait d'un bord à l'autre sur une tablette là où les cartes des écrans s'arrêtent à 420 points.
    alignItems: 'center',
  },
  header: {
    ...contentColumn,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingHorizontal: CONTENT_GUTTER,
  },
  title: {
    // Même famille de titres que les autres feuilles et que les en-têtes d'écran, en plus court : ici le titre partage sa ligne avec la fermeture, et 28 points passeraient à la ligne sur un téléphone étroit.
    fontFamily: font.black,
    fontSize: 22,
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  closeButton: {
    padding: spacing.xs,
  },
  form: {
    ...contentColumn,
    gap: spacing.md,
    padding: spacing.lg,
  },
  name: {
    fontFamily: font.semibold,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 18,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 15,
  },
});
