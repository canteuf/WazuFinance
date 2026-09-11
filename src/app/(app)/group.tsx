import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import { useGroupInvitation } from '@/hooks/use-group-invitation';
import { useGroupMembers } from '@/hooks/use-group-members';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Membres, invitation, exclusion et départ d'un groupe partagé (spec
 * section 1, écran 7).
 *
 * Le nom du groupe vient de useActiveGroup().groups, déjà chargée : cet
 * écran n'ouvre de requête que pour les membres et l'invitation.
 */
export default function GroupScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  // Garde qui évite une assertion non sûre plutôt que de documenter un cas
  // impossible : cette route n'est jamais ouverte sans id depuis groups.tsx.
  const id = typeof rawId === 'string' ? rawId : '';
  const { session } = useAuth();
  const userId = session?.user.id;
  const { groups } = useActiveGroup();
  const group = groups.find((item) => item.groupId === id);

  const {
    members,
    isLoading: membersLoading,
    error: membersError,
    isLoadingError,
  } = useGroupMembers(id);
  const {
    invitation,
    isLoading: invitationLoading,
    generate,
    regenerate,
    isGenerating,
  } = useGroupInvitation(id, userId);
  const { removeGroupMember, isRemoving } = useGroupMutations();
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string>();

  const me = members.find((member) => member.userId === userId);
  const isOwner = me?.role === 'owner';
  const hasOtherMembers = members.length > 1;

  const blockingError: unknown = isLoadingError ? membersError : null;

  function handleExclude(targetUserId: string) {
    setActionError(undefined);
    removeGroupMember.mutate(
      { groupId: id, userId: targetUserId },
      { onError: (error) => setActionError(dataErrorMessage(error)) }
    );
  }

  function handleLeave() {
    if (!userId) {
      return;
    }
    setActionError(undefined);
    removeGroupMember.mutate(
      { groupId: id, userId },
      {
        onSuccess: () => router.back(),
        onError: (error) => setActionError(dataErrorMessage(error)),
      }
    );
  }

  async function handleCopy() {
    if (!invitation) {
      return;
    }
    await Clipboard.setStringAsync(invitation.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (id === '') {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>Groupe introuvable.</Text>
        <Button title="Retour" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <Screen align="top">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={spacing.sm}
          onPress={() => router.back()}
        >
          <Text style={[styles.back, { color: colors.textMuted }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{group?.name ?? '…'}</Text>
      </View>

      {blockingError ? (
        <Text style={[styles.message, { color: colors.danger }]}>
          {dataErrorMessage(blockingError)}
        </Text>
      ) : membersLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Membres</Text>
            <View style={styles.list}>
              {members.map((member) => (
                <View key={member.userId} style={[styles.memberRow, { borderColor: colors.border }]}>
                  <View style={styles.memberInfo}>
                    <Text style={[styles.memberName, { color: colors.text }]}>
                      {member.displayName}
                    </Text>
                    <Text style={[styles.memberRole, { color: colors.textMuted }]}>
                      {member.role === 'owner' ? 'Propriétaire' : 'Membre'}
                    </Text>
                  </View>
                  {isOwner && member.userId !== userId ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Exclure ${member.displayName}`}
                      disabled={isRemoving}
                      onPress={() => handleExclude(member.userId)}
                    >
                      <Text style={[styles.exclude, { color: colors.danger }]}>Exclure</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Invitation</Text>
            {invitationLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : invitation ? (
              <View style={styles.invitationRow}>
                <Text style={[styles.code, { color: colors.text }]}>{invitation.code}</Text>
                <Pressable accessibilityRole="button" onPress={() => void handleCopy()}>
                  <Text style={[styles.link, { color: colors.primary }]}>
                    {copied ? 'Copié !' : 'Copier'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isGenerating}
                  onPress={() => {
                    setActionError(undefined);
                    regenerate.mutate(invitation.id, {
                      onError: (error) => setActionError(dataErrorMessage(error)),
                    });
                  }}
                >
                  <Text style={[styles.link, { color: colors.primary }]}>Régénérer</Text>
                </Pressable>
              </View>
            ) : (
              <Button
                title="Générer un code"
                loading={isGenerating}
                onPress={() => {
                  setActionError(undefined);
                  generate.mutate(undefined, {
                    onError: (error) => setActionError(dataErrorMessage(error)),
                  });
                }}
              />
            )}
          </View>

          {actionError ? (
            <Text style={[styles.message, { color: colors.danger }]}>{actionError}</Text>
          ) : null}

          <View style={styles.section}>
            {isOwner && hasOtherMembers ? (
              <Text style={[styles.message, { color: colors.textMuted }]}>
                Vous devez d’abord exclure les autres membres pour pouvoir quitter ce groupe.
              </Text>
            ) : null}
            <Button
              title="Quitter le groupe"
              variant="ghost"
              disabled={isOwner && hasOtherMembers}
              loading={isRemoving}
              onPress={handleLeave}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  back: {
    fontFamily: font.semibold,
    fontSize: 30,
    lineHeight: 34,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 18,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: font.semibold,
    fontSize: 10.5,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
  },
  list: {
    gap: spacing.xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberInfo: {
    flexShrink: 1,
  },
  memberName: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
  memberRole: {
    fontFamily: font.medium,
    fontSize: 12.5,
  },
  exclude: {
    fontFamily: font.semibold,
    fontSize: 13,
  },
  invitationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  code: {
    fontFamily: font.bold,
    fontSize: 18,
    letterSpacing: 2,
    flexShrink: 0,
  },
  link: {
    fontFamily: font.semibold,
    fontSize: 13,
  },
  message: {
    fontFamily: font.regular,
    fontSize: 13,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  errorTitle: {
    fontFamily: font.medium,
    fontSize: 14,
    textAlign: 'center',
  },
});
