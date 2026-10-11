import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInput } from 'react-native';

import { InvitationCodeInput } from '@/components/group/invitation-code-input';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { useFocusOnceSettled } from '@/hooks/use-transition-settled';
import { dataErrorMessage } from '@/lib/data-errors';
import {
  INVITATION_CODE_LENGTH,
  normalizeInvitationCode,
  sanitizeInvitationCodeInput,
} from '@/lib/invitation-code';
import { goBackOr } from '@/lib/navigation';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Rejoindre un groupe par code d'invitation (spec section 1, écran 7).
 *
 * Un code refusé — inconnu, révoqué ou expiré — reçoit toujours le même message : la base ne dit pas lequel (migration harden_group_access).
 *
 * Un écran qui glisse depuis la droite, pas une feuille : même raison que group-create.tsx, le code et le bouton disparaissaient au-dessus du clavier.
 */
export default function GroupJoinScreen() {
  const colors = useColors();
  const router = useRouter();
  // Présent quand l'écran s'ouvre depuis un lien d'invitation (usePendingInvite) : le code est déjà là, il ne reste qu'à confirmer.
  const { code: linkedCode } = useLocalSearchParams<{ code?: string }>();
  const { setActiveGroupId } = useActiveGroup();
  const { joinGroup, isJoining } = useGroupMutations();
  const [code, setCode] = useState(() =>
    typeof linkedCode === 'string' ? sanitizeInvitationCodeInput(linkedCode) : ''
  );
  const [touched, setTouched] = useState(false);
  const [errorText, setErrorText] = useState<string>();
  const codeRef = useRef<TextInput>(null);
  useFocusOnceSettled(codeRef);

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
    <Screen
      align="top"
      header={<ScreenHeader title="Rejoindre un groupe" onBack={() => goBackOr(router, '/groups')} />}
    >
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        Saisissez ou collez le code à 8 caractères reçu du propriétaire du groupe.
      </Text>

      <View style={styles.form}>
        <InvitationCodeInput
          ref={codeRef}
          value={code}
          onChangeText={(next) => {
            setCode(next);
            setErrorText(undefined);
          }}
          onSubmitEditing={handleSubmit}
          invalid={(touched && !valid) || errorText !== undefined}
        />

        {touched && !valid ? (
          <Text style={[styles.error, { color: colors.danger }]}>
            Le code compte 8 caractères.
          </Text>
        ) : null}
        {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

        <Button title="Rejoindre" loading={isJoining} onPress={handleSubmit} />
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
  error: {
    fontFamily: font.medium,
    fontSize: 15,
  },
});
