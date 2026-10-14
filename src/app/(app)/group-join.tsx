import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInput } from 'react-native';

import { InvitationCodeInput } from '@/components/group/invitation-code-input';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import type { InvitationPreview } from '@/data/groups';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { useToast } from '@/hooks/use-toast';
import { useFocusOnceSettled } from '@/hooks/use-transition-settled';
import { dataErrorMessage } from '@/lib/data-errors';
import {
  INVITATION_CODE_LENGTH,
  normalizeInvitationCode,
  sanitizeInvitationCodeInput,
} from '@/lib/invitation-code';
import { goBackOr } from '@/lib/navigation';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

/** Ce que le rôle offert permettra, dit avant d'entrer : un lecteur ne doit pas découvrir en arrivant qu'il ne peut rien saisir. */
function roleSentence(preview: InvitationPreview): string {
  if (preview.alreadyMember) {
    return 'Vous êtes déjà membre de ce groupe.';
  }
  return preview.role === 'viewer'
    ? 'Vous entrerez en lecture : vous verrez tout, sans rien modifier.'
    : 'Vous entrerez comme membre : vous pourrez ajouter des opérations.';
}

function membersLabel(count: number): string {
  return count === 1 ? '1 membre' : `${count} membres`;
}

/**
 * Rejoindre un groupe par code d'invitation (spec section 1, écran 7), en deux temps : le code montre d'abord le groupe — son nom, son propriétaire, le rôle offert —, puis l'utilisateur confirme.
 *
 * Rejoindre se faisait d'un geste, sans dire où : un lien reçu sur WhatsApp suffisait à faire entrer dans le groupe de quelqu'un qui se faisait passer pour un trésorier, et ce que la personne saisissait ensuite lui était visible (audit du 12 octobre 2026).
 *
 * Un code refusé — inconnu, révoqué ou expiré — reçoit toujours le même message : la base ne dit pas lequel (migration harden_group_access).
 *
 * Un écran qui glisse depuis la droite, pas une feuille : même raison que group-create.tsx, le code et le bouton disparaissaient au-dessus du clavier.
 */
export default function GroupJoinScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const router = useRouter();
  const toast = useToast();
  // Présent quand l'écran s'ouvre depuis un lien d'invitation (usePendingInvite) : le code est déjà là, le groupe s'affiche aussitôt.
  const { code: linkedCode } = useLocalSearchParams<{ code?: string }>();
  const { setActiveGroupId } = useActiveGroup();
  const { joinGroup, previewGroup, isJoining } = useGroupMutations();
  const [code, setCode] = useState(() =>
    typeof linkedCode === 'string' ? sanitizeInvitationCodeInput(linkedCode) : ''
  );
  const [touched, setTouched] = useState(false);
  const [errorText, setErrorText] = useState<string>();
  // Le groupe que le code saisi fait rejoindre ; effacé dès que le code change.
  const [preview, setPreview] = useState<InvitationPreview>();
  const codeRef = useRef<TextInput>(null);
  useFocusOnceSettled(codeRef);

  const valid = code.length === INVITATION_CODE_LENGTH;
  const { mutate: previewMutate } = previewGroup;

  function showPreview(raw: string) {
    // Le code s'affiche « 7KQ2-M9XA » chez le propriétaire ; la base stocke « 7KQ2M9XA ».
    previewMutate(normalizeInvitationCode(raw), {
      onSuccess: setPreview,
      onError: (error) => setErrorText(dataErrorMessage(error)),
    });
  }

  // Ouvert depuis un lien : le groupe s'affiche sans attendre un geste, la confirmation reste à faire. Une fois par lien reçu, pas à chaque frappe.
  const showLinkedPreview = useEffectEvent(() => {
    if (code.length === INVITATION_CODE_LENGTH) {
      showPreview(code);
    }
  });
  useEffect(() => {
    if (typeof linkedCode === 'string') {
      showLinkedPreview();
    }
  }, [linkedCode]);

  function handleSubmit() {
    setTouched(true);
    setErrorText(undefined);
    if (!valid) {
      return;
    }
    if (!preview) {
      showPreview(code);
      return;
    }
    const joined = preview;
    joinGroup.mutate(normalizeInvitationCode(code), {
      onSuccess: (groupId) => {
        // Le groupe rejoint devient le groupe actif, et l'écran le dit : la suite des saisies part là.
        setActiveGroupId(groupId);
        toast.show(
          joined.alreadyMember
            ? `Vous êtes dans « ${joined.groupName} »`
            : `Vous avez rejoint « ${joined.groupName} »`
        );
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
            setPreview(undefined);
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

        {preview ? (
          <View
            style={[styles.card, { backgroundColor: colors.surface }, elevation.card]}
            accessible
            accessibilityLabel={[
              `Groupe ${preview.groupName}`,
              preview.ownerName ? `géré par ${preview.ownerName}` : null,
              membersLabel(preview.memberCount),
              roleSentence(preview),
            ]
              .filter(Boolean)
              .join(', ')}
          >
            <View style={styles.cardTitleRow}>
              <MaterialCommunityIcons name="account-group-outline" size={22} color={colors.primary} />
              <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={2}>
                {preview.groupName}
              </Text>
            </View>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {[preview.ownerName ? `Géré par ${preview.ownerName}` : null, membersLabel(preview.memberCount)]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text style={[styles.role, { color: colors.text }]}>{roleSentence(preview)}</Text>
            {preview.alreadyMember ? null : (
              <Text style={[styles.warning, { color: colors.textMuted }]}>
                Ses membres verront ce que vous y saisirez. Ne rejoignez que des personnes que vous connaissez.
              </Text>
            )}
          </View>
        ) : null}

        <Button
          title={
            preview
              ? preview.alreadyMember
                ? 'Ouvrir ce groupe'
                : `Rejoindre « ${preview.groupName} »`
              : 'Continuer'
          }
          loading={isJoining || previewGroup.isPending}
          onPress={handleSubmit}
        />
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
  card: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  groupName: {
    flexShrink: 1,
    fontFamily: font.semibold,
    fontSize: 18,
  },
  meta: {
    fontFamily: font.regular,
    fontSize: 14,
  },
  role: {
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  warning: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
  },
});
