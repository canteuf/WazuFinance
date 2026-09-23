import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AvatarStack, MemberAvatar } from '@/components/ui/member-avatar';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import { useGroupInvitation } from '@/hooks/use-group-invitation';
import { useGroupMembers } from '@/hooks/use-group-members';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { daysUntilExpiry, formatInvitationCode } from '@/lib/invitation-code';
import { goBackOr } from '@/lib/navigation';
import { font, radius, spacing, useColors, useIsDark } from '@/theme/tokens';

/** Nombre de pastilles dans l'en-tête ; le reste est dit par le « +N » et par la liste dessous. */
const HEADER_AVATARS = 3;

/**
 * Détail d'un groupe partagé (écran 7), d'après la maquette Stitch `coloc_gambetta_wazu_finance` : membres, invitation, exclusion et départ.
 *
 * Le nom du groupe vient de useActiveGroup().groups, déjà chargée : cet écran n'ouvre de requête que pour les membres et l'invitation.
 *
 * Écarts assumés avec la maquette : pas de menu « ⋮ », qui n'aurait rien à proposer ; pas de badge « Gérant » en plus de « Propriétaire », qui dirait deux fois la même chose ; et la phrase sous « Quitter le groupe » ne promet plus de transmission automatique — elle n'existe pas, un propriétaire doit d'abord exclure les autres membres.
 */
export default function GroupScreen() {
  const colors = useColors();
  const isDark = useIsDark();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  // Garde qui évite une assertion non sûre plutôt que de documenter un cas impossible : cette route n'est jamais ouverte sans id depuis groups.tsx.
  const id = typeof rawId === 'string' ? rawId : '';
  const { session } = useAuth();
  const userId = session?.user.id;
  const { groups, activeGroupId } = useActiveGroup();
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
    // La forme affichée, pas la forme stockée : c'est celle que l'invité verra dans le message, et l'écran « Rejoindre » la ramène de lui-même à la forme stockée.
    await Clipboard.setStringAsync(formatInvitationCode(invitation.code));
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

  const memberCountLabel = members.length === 1 ? '1 membre' : `${members.length} membres`;

  return (
    <Screen
      align="top"
      header={
        <ScreenHeader
          title="Détail du groupe"
          subtitle="Gestion du groupe"
          onBack={() => goBackOr(router, '/groups')}
        />
      }
    >

      {blockingError ? (
        <Text style={[styles.message, { color: colors.danger }]}>
          {dataErrorMessage(blockingError)}
        </Text>
      ) : membersLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <Card style={styles.summary}>
            <View style={styles.summaryHead}>
              <MaterialCommunityIcons name="account-group-outline" size={24} color={colors.primary} />
              <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={2}>
                {group?.name ?? '…'}
              </Text>
              {id === activeGroupId ? <StatusBadge tone="ok" label="Actif" /> : null}
            </View>
            <View style={styles.summaryFoot}>
              <View style={styles.summaryText}>
                <Text style={[styles.caption, { color: colors.textMuted }]}>Statut & équipe</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  Budget partagé · {memberCountLabel}
                </Text>
              </View>
              <AvatarStack
                members={members
                  .slice(0, HEADER_AVATARS)
                  .map((member) => ({ name: member.displayName, avatar: member.avatar }))}
                total={members.length}
              />
            </View>
          </Card>

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Membres du groupe</Text>
              <Text style={[styles.caption, { color: colors.textMuted }]}>{memberCountLabel}</Text>
            </View>
            <Card flush>
              {members.map((member, index) => {
                const isMe = member.userId === userId;
                const owner = member.role === 'owner';
                return (
                  <Fragment key={member.userId}>
                    {index > 0 ? (
                      <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    ) : null}
                    <View style={styles.memberRow}>
                      <MemberAvatar name={member.displayName} avatar={member.avatar} size={44} />
                      <View style={styles.memberInfo}>
                        <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                          {member.displayName}
                          {isMe ? (
                            <Text style={[styles.you, { color: colors.textMuted }]}> (vous)</Text>
                          ) : null}
                        </Text>
                        <View
                          style={[
                            styles.roleTag,
                            {
                              backgroundColor:
                                owner && !isDark ? `${colors.positive}33` : colors.surfaceMuted,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.roleLabel,
                              { color: owner ? colors.positive : colors.text },
                            ]}
                          >
                            {owner ? 'Propriétaire' : 'Membre'}
                          </Text>
                        </View>
                      </View>
                      {isOwner && !isMe ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Exclure ${member.displayName}`}
                          disabled={isRemoving}
                          hitSlop={spacing.sm}
                          onPress={() => handleExclude(member.userId)}
                        >
                          <Text style={[styles.exclude, { color: colors.danger }]}>Exclure</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </Fragment>
                );
              })}
            </Card>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Invitation</Text>
              <MaterialCommunityIcons name="account-plus-outline" size={20} color={colors.textMuted} />
            </View>
            <Card style={styles.invitation}>
              <Text style={[styles.body, { color: colors.text }]}>
                Partagez ce code pour inviter quelqu’un à rejoindre le budget commun. Il ne sert
                qu’une fois.
              </Text>

              {invitationLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : invitation ? (
                <>
                  <View style={[styles.codeBox, { backgroundColor: colors.surfaceMuted }]}>
                    <Text style={[styles.codeLabel, { color: colors.textMuted }]}>
                      Code d’invitation
                    </Text>
                    <Text style={[styles.code, { color: colors.text }]} selectable>
                      {formatInvitationCode(invitation.code)}
                    </Text>
                    <Text style={[styles.caption, { color: colors.textMuted }]}>
                      {expiryLabel(daysUntilExpiry(invitation.expiresAt))}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Copier le code d’invitation"
                    onPress={() => void handleCopy()}
                    style={({ pressed }) => [
                      styles.copyButton,
                      { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={copied ? 'check' : 'content-copy'}
                      size={18}
                      color={colors.primaryText}
                    />
                    <Text style={[styles.copyLabel, { color: colors.primaryText }]}>
                      {copied ? 'Code copié' : 'Copier le code'}
                    </Text>
                  </Pressable>
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
                      style={styles.regenerate}
                    >
                      <MaterialCommunityIcons name="refresh" size={16} color={colors.textMuted} />
                      <Text style={[styles.regenerateLabel, { color: colors.textMuted }]}>
                        Régénérer un nouveau code
                      </Text>
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
                <Text style={[styles.caption, { color: colors.textMuted }]}>
                  Aucune invitation active. Le propriétaire du groupe peut en générer une.
                </Text>
              )}
            </Card>
          </View>

          {actionError ? (
            <Text style={[styles.message, { color: colors.danger }]}>{actionError}</Text>
          ) : null}

          <View style={styles.leave}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: (isOwner && hasOtherMembers) || isRemoving }}
              disabled={(isOwner && hasOtherMembers) || isRemoving}
              onPress={handleLeave}
              style={({ pressed }) => [
                styles.leaveButton,
                {
                  backgroundColor: colors.surfaceMuted,
                  opacity: isOwner && hasOtherMembers ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
            >
              {isRemoving ? (
                <ActivityIndicator color={colors.danger} />
              ) : (
                <>
                  <MaterialCommunityIcons name="logout" size={18} color={colors.danger} />
                  <Text style={[styles.leaveLabel, { color: colors.danger }]}>
                    Quitter le groupe
                  </Text>
                </>
              )}
            </Pressable>
            {/* Une action impossible est expliquée, pas simplement désactivée — et la phrase dit la vraie règle : il n'existe aucune transmission automatique du groupe. */}
            <Text style={[styles.leaveHint, { color: colors.textMuted }]}>
              {isOwner && hasOtherMembers
                ? 'En tant que propriétaire, excluez d’abord les autres membres pour pouvoir quitter ce groupe.'
                : 'Vos opérations restent dans le groupe après votre départ.'}
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

function expiryLabel(days: number): string {
  if (days === 0) {
    return 'Expire aujourd’hui';
  }
  return days === 1 ? 'Expire demain' : `Expire dans ${days} jours`;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  errorTitle: {
    fontFamily: font.semibold,
    fontSize: 18,
  },
  summary: {
    gap: spacing.md,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  groupName: {
    flex: 1,
    fontFamily: font.bold,
    fontSize: 22,
    letterSpacing: -0.3,
  },
  summaryFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryText: {
    gap: 2,
    flexShrink: 1,
  },
  summaryValue: {
    fontFamily: font.bold,
    fontSize: 18,
  },
  section: {
    gap: spacing.sm + 2,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: font.bold,
    fontSize: 20,
    letterSpacing: -0.2,
  },
  caption: {
    fontFamily: font.regular,
    fontSize: 14.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    marginHorizontal: spacing.md,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  memberInfo: {
    flex: 1,
    gap: 4,
    alignItems: 'flex-start',
  },
  memberName: {
    fontFamily: font.bold,
    fontSize: 18,
  },
  you: {
    fontFamily: font.regular,
    fontSize: 15,
  },
  roleTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  roleLabel: {
    fontFamily: font.semibold,
    fontSize: 13.5,
  },
  exclude: {
    fontFamily: font.bold,
    fontSize: 16,
  },
  invitation: {
    gap: spacing.md,
  },
  body: {
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 22,
  },
  codeBox: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  codeLabel: {
    fontFamily: font.semibold,
    fontSize: 13.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  code: {
    fontFamily: font.black,
    fontSize: 30,
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.md,
  },
  copyLabel: {
    fontFamily: font.bold,
    fontSize: 17,
  },
  regenerate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    alignSelf: 'center',
    paddingVertical: spacing.xs,
  },
  regenerateLabel: {
    fontFamily: font.medium,
    fontSize: 16,
  },
  message: {
    fontFamily: font.medium,
    fontSize: 16,
  },
  leave: {
    gap: spacing.sm,
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.md,
  },
  leaveLabel: {
    fontFamily: font.bold,
    fontSize: 17,
  },
  leaveHint: {
    fontFamily: font.regular,
    fontSize: 14.5,
    textAlign: 'center',
    lineHeight: 20,
  },
});
