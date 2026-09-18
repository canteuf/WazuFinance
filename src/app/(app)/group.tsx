import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import { useGroupInvitation } from '@/hooks/use-group-invitation';
import { useGroupMembers } from '@/hooks/use-group-members';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { goBackOr } from '@/lib/navigation';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/**
 * Membres, invitation, exclusion et départ d'un groupe partagé (spec section 1, écran 7).
 *
 * Le nom du groupe vient de useActiveGroup().groups, déjà chargée : cet écran n'ouvre de requête que pour les membres et l'invitation.
 */
export default function GroupScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  // Garde qui évite une assertion non sûre plutôt que de documenter un cas impossible : cette route n'est jamais ouverte sans id depuis groups.tsx.
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
        // Après un départ, revenir sur /group n'aurait aucun sens : on vise la liste directement plutôt que de remonter la pile.
        onSuccess: () => router.dismissTo('/groups'),
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
        <Button title="Retour" variant="ghost" onPress={() => goBackOr(router, '/groups')} />
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
          onPress={() => goBackOr(router, '/groups')}
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.textMuted} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {group?.name ?? '…'}
          </Text>
          {members.length > 0 ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {members.length === 1 ? '1 membre' : `${members.length} membres`}
            </Text>
          ) : null}
        </View>
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
            <Card flush>
              {members.map((member, index) => (
                <Fragment key={member.userId}>
                  {index > 0 ? (
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  ) : null}
                  <View style={styles.memberRow}>
                    <View style={[styles.avatar, { backgroundColor: colors.surfaceMuted }]}>
                      <MaterialCommunityIcons
                        name="account-outline"
                        size={18}
                        color={colors.textMuted}
                      />
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
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
                </Fragment>
              ))}
            </Card>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Invitation</Text>
            {invitationLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : invitation ? (
              <>
                {/* Cadre en pointillés : le code est à recopier ou à transmettre, pas à lire au fil du texte. Le pointillé le désigne comme une valeur détachable, là où un trait plein en aurait fait une carte de plus. */}
                <View style={[styles.codeBox, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                  <Text style={[styles.code, { color: colors.text }]} selectable>
                    {invitation.code}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Copier le code d’invitation"
                    onPress={() => void handleCopy()}
                    style={[styles.copyButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <MaterialCommunityIcons
                      name={copied ? 'check' : 'content-copy'}
                      size={15}
                      color={copied ? colors.positive : colors.text}
                    />
                    <Text
                      style={[styles.copyLabel, { color: copied ? colors.positive : colors.text }]}
                    >
                      {copied ? 'Copié' : 'Copier'}
                    </Text>
                  </Pressable>
                </View>
                {isOwner ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={isGenerating}
                    onPress={() => {
                      setActionError(undefined);
                      regenerate.mutate(invitation.id, {
                        onError: (error) => setActionError(dataErrorMessage(error)),
                      });
                    }}
                    style={styles.regenerateRow}
                  >
                    <Text style={[styles.link, { color: colors.primary }]}>Régénérer le code</Text>
                  </Pressable>
                ) : null}
              </>
            ) : isOwner ? (
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
            ) : (
              <Text style={[styles.message, { color: colors.textMuted }]}>
                Aucune invitation active.
              </Text>
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
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  headerText: {
    gap: 3,
    flexShrink: 1,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 24,
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 12.5,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  memberInfo: {
    gap: 1,
    // Prend la place restante : « Exclure » garde la sienne.
    flex: 1,
  },
  memberName: {
    fontFamily: font.semibold,
    fontSize: 15,
  },
  memberRole: {
    fontFamily: font.regular,
    fontSize: 12,
  },
  exclude: {
    fontFamily: font.semibold,
    fontSize: 13,
    flexShrink: 0,
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: 'dashed',
  },
  code: {
    fontFamily: font.bold,
    fontSize: 22,
    letterSpacing: 3.5,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    flexShrink: 0,
  },
  copyLabel: {
    fontFamily: font.semibold,
    fontSize: 13,
  },
  regenerateRow: {
    alignSelf: 'flex-start',
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
