import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { InvitationCodeInput } from '@/components/group/invitation-code-input';
import { Button } from '@/components/ui/button';
import { CONTENT_GUTTER, contentColumn } from '@/components/ui/screen';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { INVITATION_CODE_LENGTH, normalizeInvitationCode } from '@/lib/invitation-code';
import { goBackOr } from '@/lib/navigation';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Rejoindre un groupe par code d'invitation (spec section 1, écran 7).
 *
 * Un code refusé — inconnu, révoqué, utilisé ou expiré — reçoit toujours le même message : la base ne dit pas lequel (migration harden_group_access).
 */
export default function GroupJoinScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setActiveGroupId } = useActiveGroup();
  const { joinGroup, isJoining } = useGroupMutations();
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const [errorText, setErrorText] = useState<string>();

  const valid = code.length === INVITATION_CODE_LENGTH;

  function handleSubmit() {
    setTouched(true);
    setErrorText(undefined);
    if (!valid) {
      return;
    }
    // Le code s'affiche « 7KQ2-M9XA » chez le propriétaire ; la base stocke « 7KQ2M9XA ».
    joinGroup.mutate(normalizeInvitationCode(code), {
      onSuccess: (groupId) => {
        setActiveGroupId(groupId);
        goBackOr(router, '/groups');
      },
      onError: (error) => setErrorText(dataErrorMessage(error)),
    });
  }

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Rejoindre un groupe</Text>
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
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Saisissez ou collez le code à 8 caractères reçu du propriétaire du groupe.
        </Text>

        <InvitationCodeInput
          value={code}
          onChangeText={(next) => {
            setCode(next);
            setErrorText(undefined);
          }}
          onSubmitEditing={handleSubmit}
          invalid={(touched && !valid) || errorText !== undefined}
          autoFocus
        />

        {touched && !valid ? (
          <Text style={[styles.error, { color: colors.danger }]}>
            Le code compte 8 caractères.
          </Text>
        ) : null}
        {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

        <Button title="Rejoindre" loading={isJoining} onPress={handleSubmit} />
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
  hint: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 21,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 15,
  },
});
