import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link, useRouter } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { StatusBadge } from '@/components/ui/status-badge';
import { useActiveGroup } from '@/hooks/use-active-group';
import { goBackOr } from '@/lib/navigation';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/**
 * Groupes de l'utilisateur (spec section 1, écran 7) : bascule du groupe actif, création d'un groupe partagé, adhésion par code.
 *
 * `useActiveGroup().groups` est déjà chargée par ActiveGroupProvider : cet écran n'ouvre aucune requête, il affiche et bascule ce qui existe déjà.
 */
export default function GroupsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { groups, activeGroupId, setActiveGroupId } = useActiveGroup();

  return (
    <Screen align="top">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={spacing.sm}
          onPress={() => goBackOr(router, '/')}
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.textMuted} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>Mes groupes</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Le compte personnel est un groupe à un membre
          </Text>
        </View>
      </View>

      {/* Une seule carte pour toute la liste, séparée par des filets : les groupes forment un choix unique, et autant de cartes détachées les présenteraient comme des objets sans rapport entre eux. */}
      <Card flush>
        {groups.map((group, index) => {
          const active = group.groupId === activeGroupId;

          return (
            <Fragment key={group.groupId}>
              {index > 0 ? (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              ) : null}
              <View style={[styles.row, active && { backgroundColor: colors.surfaceMuted }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Activer ${group.name}${active ? ', déjà actif' : ''}`}
                  onPress={() => setActiveGroupId(group.groupId)}
                  style={styles.rowMain}
                >
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: active ? colors.primary : colors.border },
                    ]}
                  />
                  <View style={styles.rowText}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {group.name}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textMuted }]}>
                      {group.isPersonal ? 'Compte personnel' : 'Groupe partagé'}
                    </Text>
                  </View>
                </Pressable>

                {active ? <StatusBadge tone="ok" label="Actif" /> : null}

                {!group.isPersonal ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Gérer ${group.name}`}
                    hitSlop={spacing.sm}
                    onPress={() => router.push(`/group?id=${group.groupId}`)}
                  >
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={22}
                      color={colors.textMuted}
                    />
                  </Pressable>
                ) : null}
              </View>
            </Fragment>
          );
        })}
      </Card>

      <View style={styles.actions}>
        <Link href="/group-create" asChild>
          <Pressable
            accessibilityRole="button"
            // Aplati : <Link asChild> transmet le style à son enfant via un Slot, qui lève une erreur de rendu en développement s'il reçoit un tableau.
            style={StyleSheet.flatten([
              styles.action,
              { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
            ])}
          >
            <MaterialCommunityIcons name="account-multiple-plus-outline" size={19} color={colors.text} />
            <Text style={[styles.actionLabel, { color: colors.text }]}>Créer</Text>
          </Pressable>
        </Link>
        <Link href="/group-join" asChild>
          <Pressable
            accessibilityRole="button"
            style={StyleSheet.flatten([
              styles.action,
              { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
            ])}
          >
            <MaterialCommunityIcons name="key-outline" size={19} color={colors.text} />
            <Text style={[styles.actionLabel, { color: colors.text }]}>Rejoindre</Text>
          </Pressable>
        </Link>
      </View>
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
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 12.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // Prend la place restante : le badge et le chevron gardent la leur.
    flex: 1,
  },
  rowText: {
    gap: 1,
    flexShrink: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 15,
  },
  meta: {
    fontFamily: font.regular,
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  actionLabel: {
    fontFamily: font.semibold,
    fontSize: 15,
  },
});
