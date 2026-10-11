import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { useFocusOnceSettled } from '@/hooks/use-transition-settled';
import { dataErrorMessage } from '@/lib/data-errors';
import { goBackOr } from '@/lib/navigation';
import { GROUP_NAME_MAX_LENGTH } from '@/lib/validation';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/**
 * Créer un groupe partagé (spec section 1, écran 7). Un seul champ.
 *
 * Un écran qui glisse depuis la droite, pas une feuille qui monte du bas : la feuille, courte, était remontée en entier au-dessus du clavier par react-native-screens pendant que la bibliothèque de clavier faisait défiler son contenu d'autant, et le champ comme le bouton disparaissaient au-dessus de la partie visible (Pixel 7, APK 1.1.3). Trois corrections sur la feuille n'en sont pas venues à bout ; un écran gère le clavier comme la connexion ou le mot de passe oublié.
 */
export default function GroupCreateScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setActiveGroupId } = useActiveGroup();
  const { createGroup, isCreating } = useGroupMutations();
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [errorText, setErrorText] = useState<string>();
  const nameRef = useRef<TextInput>(null);
  useFocusOnceSettled(nameRef);

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
    <Screen
      align="top"
      header={<ScreenHeader title="Créer un groupe" onBack={() => goBackOr(router, '/groups')} />}
    >
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        Un budget partagé : vous pourrez ensuite inviter vos proches avec un code.
      </Text>

      <View style={styles.form}>
        <TextInput
          ref={nameRef}
          accessibilityLabel="Nom du groupe"
          placeholder="Coloc, Famille…"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          maxLength={GROUP_NAME_MAX_LENGTH}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 22,
  },
  form: {
    gap: spacing.md,
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
