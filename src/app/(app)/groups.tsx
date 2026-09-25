import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { AvatarStack } from '@/components/ui/member-avatar';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StatusBadge } from '@/components/ui/status-badge';
import type { GroupOverview, MembershipSummary } from '@/data/groups';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useGroupOverviews } from '@/hooks/use-group-overviews';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatMoney } from '@/lib/money';
import { goBackOr } from '@/lib/navigation';
import { font, radius, spacing, useColors, useElevation, useIsDark } from '@/theme/tokens';

/**
 * Mes groupes (écran 7), d'après la maquette Stitch `mes_groupes_wazu_finance`.
 *
 * Toucher une carte fait du groupe le groupe actif ; le chevron d'un groupe partagé ouvre sa gestion. Le compte personnel n'a pas de chevron : il n'a qu'un membre, rien à gérer.
 *
 * Écarts assumés avec la maquette : les libellés « Équilibré », « Prévu été 2025 » et « Synchronisé » sont retirés, aucune donnée ne les porte ; le total commun ne compte que les groupes partagés, comme son nom l'annonce ; et le texte de confidentialité dit ce que les policies garantissent vraiment, pas davantage.
 */
export default function GroupsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { groups, activeGroupId, setActiveGroupId } = useActiveGroup();
  const { overviews, isLoading, error } = useGroupOverviews();

  return (
    <Screen
      align="top"
      header={
        <ScreenHeader title="Mes groupes" onBack={() => goBackOr(router, '/')}>
          <View style={[styles.countPill, { backgroundColor: colors.surfaceMuted }]}>
            <Text style={[styles.countLabel, { color: colors.text }]}>
              {groups.length === 1 ? '1 espace' : `${groups.length} espaces`}
            </Text>
          </View>
        </ScreenHeader>
      }
    >
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Votre compte personnel et les budgets que vous partagez.
      </Text>

      <View style={styles.actions}>
        <ActionCard
          href="/group-create"
          icon="plus"
          title="Créer un groupe"
          caption="Nouveau budget partagé"
          emphasis
        />
        <ActionCard
          href="/group-join"
          icon="dialpad"
          title="Rejoindre"
          caption="Avec un code d’invitation"
        />
      </View>

      <SharedTotal
        total={overviews?.sharedMonthlyTotal}
        isLoading={isLoading}
        error={error}
      />

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Vos groupes</Text>

      <View style={styles.list}>
        {groups.map((group) => (
          <GroupCard
            key={group.groupId}
            group={group}
            overview={overviews?.byGroup.get(group.groupId)}
            active={group.groupId === activeGroupId}
            onActivate={() => setActiveGroupId(group.groupId)}
            onManage={() => router.push(`/group?id=${group.groupId}`)}
          />
        ))}
      </View>

      {/* Ce que les policies garantissent, et rien de plus : un groupe partagé est visible de tous ses membres, le compte personnel et les objectifs d'épargne de personne d'autre. */}
      <View style={[styles.note, { backgroundColor: colors.surfaceMuted }]}>
        <MaterialCommunityIcons name="eye-off-outline" size={22} color={colors.primary} />
        <Text style={[styles.noteText, { color: colors.text }]}>
          Votre compte personnel et vos objectifs d’épargne restent invisibles des autres membres.
          Seuls les opérations et les budgets d’un groupe partagé sont vues de tout le groupe.
        </Text>
      </View>
    </Screen>
  );
}

function ActionCard({
  href,
  icon,
  title,
  caption,
  emphasis = false,
}: {
  href: '/group-create' | '/group-join';
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  caption: string;
  /** Créer est l'action principale de l'écran : pleine, à l'accent ; rejoindre reste une carte. */
  emphasis?: boolean;
}) {
  const colors = useColors();
  const elevation = useElevation();

  const foreground = emphasis ? colors.primaryText : colors.text;

  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${caption}`}
        // Aplati : <Link asChild> transmet le style par un Slot, qui lève une erreur de rendu en développement s'il reçoit un tableau.
        style={StyleSheet.flatten([
          styles.actionCard,
          emphasis ? null : elevation.card,
          { backgroundColor: emphasis ? colors.primary : colors.surface },
        ])}
      >
        <View
          style={[
            styles.actionIcon,
            {
              backgroundColor: emphasis ? 'rgba(255,255,255,0.18)' : colors.surfaceMuted,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={icon}
            size={22}
            color={emphasis ? colors.primaryText : colors.primary}
          />
        </View>
        <Text style={[styles.actionTitle, { color: foreground }]}>{title}</Text>
        <Text
          style={[
            styles.actionCaption,
            { color: emphasis ? colors.primaryText : colors.textMuted, opacity: emphasis ? 0.85 : 1 },
          ]}
        >
          {caption}
        </Text>
      </Pressable>
    </Link>
  );
}

function SharedTotal({
  total,
  isLoading,
  error,
}: {
  total: number | undefined;
  isLoading: boolean;
  error: unknown;
}) {
  const colors = useColors();
  const isDark = useIsDark();

  return (
    <View style={[styles.total, { backgroundColor: colors.surfaceMuted }]}>
      <View
        style={[
          styles.totalIcon,
          { backgroundColor: isDark ? colors.surface : `${colors.positive}33` },
        ]}
      >
        <MaterialCommunityIcons name="vector-link" size={24} color={colors.positive} />
      </View>
      <View style={styles.totalText}>
        <Text style={[styles.totalLabel, { color: colors.textMuted }]}>Total engagé en commun</Text>
        {error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
        ) : isLoading || total === undefined ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : (
          <Text style={[styles.totalValue, { color: colors.text }]}>{formatMoney(total)}</Text>
        )}
        {/* Dit d'où vient le chiffre : sans cette ligne, « engagé » se lirait comme « dépensé ». */}
        <Text style={[styles.totalHint, { color: colors.textMuted }]}>
          Plafonds mensuels de vos groupes partagés
        </Text>
      </View>
    </View>
  );
}

function GroupCard({
  group,
  overview,
  active,
  onActivate,
  onManage,
}: {
  group: MembershipSummary;
  overview: GroupOverview | undefined;
  active: boolean;
  onActivate: () => void;
  onManage: () => void;
}) {
  const colors = useColors();

  const meta = overview
    ? [
        overview.memberCount === 1 ? '1 membre' : `${overview.memberCount} membres`,
        overview.monthlyBudget > 0
          ? `${formatMoney(overview.monthlyBudget)} budgétés ce mois`
          : 'Aucun plafond',
      ].join(' · ')
    : null;

  return (
    <Card flush>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${group.name}${active ? ', groupe actif' : '. Activer'}${meta ? `. ${meta}` : ''}`}
        onPress={onActivate}
        style={({ pressed }) => [styles.groupBody, pressed && { backgroundColor: colors.surfaceMuted }]}
      >
        <View style={styles.groupHead}>
          <View style={[styles.groupIcon, { backgroundColor: colors.surfaceMuted }]}>
            <MaterialCommunityIcons
              name={group.isPersonal ? 'home-outline' : 'account-group-outline'}
              size={24}
              color={colors.primary}
            />
          </View>
          <View style={styles.groupText}>
            <View style={styles.groupTitleRow}>
              <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={2}>
                {group.name}
              </Text>
              {active ? <StatusBadge tone="ok" label="Actif" /> : null}
            </View>
            {meta ? (
              <Text style={[styles.groupMeta, { color: colors.textMuted }]}>{meta}</Text>
            ) : null}
          </View>
          {/* Emplacement réservé au chevron « Gérer », rendu hors de ce Pressable : un bouton dans un bouton est du HTML invalide sur le web. */}
          {group.isPersonal ? null : <View style={styles.manageSlot} />}
        </View>

        <View style={styles.groupFoot}>
          {overview ? (
            <AvatarStack members={overview.members} total={overview.memberCount} />
          ) : (
            <View />
          )}
          <View style={styles.groupTags}>
            <RoleTag owner={group.role === 'owner'} />
            {group.isPersonal ? (
              <Text style={[styles.groupSide, { color: colors.textMuted }]}>Personnel</Text>
            ) : null}
          </View>
        </View>
      </Pressable>
      {group.isPersonal ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Gérer ${group.name}`}
          hitSlop={spacing.md}
          onPress={onManage}
          style={styles.manage}
        >
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textMuted} />
        </Pressable>
      )}
    </Card>
  );
}

/** « Propriétaire » en vert, « Membre » en neutre : le rôle décide de ce qu'on peut faire dans le groupe, il se lit d'un coup d'œil. */
function RoleTag({ owner }: { owner: boolean }) {
  const colors = useColors();
  const isDark = useIsDark();

  return (
    <View
      style={[
        styles.roleTag,
        {
          backgroundColor: owner
            ? isDark
              ? colors.surfaceMuted
              : `${colors.positive}33`
            : colors.surfaceMuted,
        },
      ]}
    >
      <Text style={[styles.roleLabel, { color: owner ? colors.positive : colors.text }]}>
        {owner ? 'Propriétaire' : 'Membre'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  countPill: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  countLabel: {
    fontFamily: font.medium,
    fontSize: 15,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 17,
    marginTop: -spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionCard: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    minHeight: 150,
    justifyContent: 'flex-end',
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'auto',
  },
  actionTitle: {
    fontFamily: font.bold,
    fontSize: 20,
    letterSpacing: -0.2,
  },
  actionCaption: {
    fontFamily: font.regular,
    fontSize: 15,
  },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  totalIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalText: {
    flex: 1,
    gap: 2,
  },
  totalLabel: {
    fontFamily: font.semibold,
    fontSize: 13.5,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  totalValue: {
    fontFamily: font.black,
    fontSize: 26,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  totalHint: {
    fontFamily: font.regular,
    fontSize: 14,
  },
  loader: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  sectionTitle: {
    fontFamily: font.bold,
    fontSize: 22,
    letterSpacing: -0.3,
  },
  list: {
    gap: spacing.md,
  },
  groupBody: {
    gap: spacing.md,
    padding: spacing.md,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  manageSlot: {
    width: 24,
    height: 24,
  },
  manage: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
  groupIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupText: {
    flex: 1,
    gap: spacing.xs,
  },
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  groupName: {
    fontFamily: font.bold,
    fontSize: 20,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  groupMeta: {
    fontFamily: font.regular,
    fontSize: 15.5,
  },
  groupFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  groupTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  groupSide: {
    fontFamily: font.regular,
    fontSize: 15,
  },
  roleTag: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  roleLabel: {
    fontFamily: font.semibold,
    fontSize: 14.5,
  },
  note: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  noteText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 23,
    // Justifié comme la carte de suppression de compte, pour la même raison : le paragraphe fait quatre lignes pleines, et un bord droit en dents de scie donne un air brouillon à une note qu'on veut voir lue. Android n'applique `justify` qu'à partir d'API 26 ; en dessous le texte reste aligné à gauche.
    textAlign: 'justify',
  },
  error: {
    fontFamily: font.medium,
    fontSize: 15,
  },
});
