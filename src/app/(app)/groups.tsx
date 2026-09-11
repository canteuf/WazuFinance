import { Link, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { useActiveGroup } from '@/hooks/use-active-group';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/**
 * Groupes de l'utilisateur (spec section 1, écran 7) : bascule du groupe
 * actif, création d'un groupe partagé, adhésion par code.
 *
 * `useActiveGroup().groups` est déjà chargée par ActiveGroupProvider : cet
 * écran n'ouvre aucune requête, il affiche et bascule ce qui existe déjà.
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
          onPress={() => router.back()}
        >
          <Text style={[styles.back, { color: colors.textMuted }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Groupes</Text>
      </View>

      <View style={styles.list}>
        {groups.map((group) => {
          const active = group.groupId === activeGroupId;
          return (
            <View
              key={group.groupId}
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Activer ${group.name}${active ? ', déjà actif' : ''}`}
                onPress={() => setActiveGroupId(group.groupId)}
                style={styles.rowMain}
              >
                {active ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
                <Text style={[styles.name, { color: colors.text }]}>{group.name}</Text>
              </Pressable>

              {!group.isPersonal ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Gérer ${group.name}`}
                  hitSlop={spacing.sm}
                  onPress={() => router.push(`/group?id=${group.groupId}`)}
                >
                  <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Link href="/group-create" asChild>
          <Pressable
            accessibilityRole="button"
            style={StyleSheet.flatten([styles.action, { borderColor: colors.border }])}
          >
            <Text style={[styles.actionLabel, { color: colors.text }]}>Créer un groupe partagé</Text>
          </Pressable>
        </Link>
        <Link href="/group-join" asChild>
          <Pressable
            accessibilityRole="button"
            style={StyleSheet.flatten([styles.action, { borderColor: colors.border }])}
          >
            <Text style={[styles.actionLabel, { color: colors.text }]}>Rejoindre un groupe</Text>
          </Pressable>
        </Link>
      </View>
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
  },
  list: {
    gap: spacing.sm + 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
  chevron: {
    fontFamily: font.semibold,
    fontSize: 20,
  },
  actions: {
    gap: spacing.sm,
  },
  action: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
  },
  actionLabel: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
});
