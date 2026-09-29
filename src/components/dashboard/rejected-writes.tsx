import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useRejectedWrites } from '@/hooks/use-rejected-writes';
import type { RejectedWrite } from '@/lib/rejected-writes';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * « À corriger » : les saisies faites sans réseau que la base a refusées une fois envoyées (voir rejected-writes.ts). Juste au-dessus des saisies en attente, sur la Synthèse et en tête de l'historique. Ne rend rien quand la liste est vide.
 *
 * Une création se reprend dans le formulaire, pré-rempli, dans son groupe d'origine si l'on en est toujours membre ; une modification rouvre l'opération. Une suppression ou un remboursement refusés n'ont rien à reprendre : ils disent seulement pourquoi, et se retirent d'un toucher.
 */
export function RejectedWrites() {
  const colors = useColors();
  const router = useRouter();
  const { items, dismiss } = useRejectedWrites();
  const { groups, setActiveGroupId } = useActiveGroup();

  if (items.length === 0) {
    return null;
  }

  function fix(item: RejectedWrite) {
    if (item.kind === 'create' && item.draft) {
      if (groups.some((group) => group.groupId === item.draft?.groupId)) {
        setActiveGroupId(item.draft.groupId);
      }
      router.push({ pathname: '/transaction', params: { draft: item.id } });
      return;
    }
    if (item.kind === 'update' && item.transactionId) {
      dismiss(item.id);
      router.push({ pathname: '/transaction', params: { id: item.transactionId } });
    }
  }

  return (
    <View style={styles.block}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.danger} />
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          À corriger
        </Text>
      </View>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        Ces saisies, faites sans réseau, ont été refusées à l’envoi. Elles ne sont pas comptées.
      </Text>
      <Card flush>
        {items.map((item, index) => {
          const canFix = (item.kind === 'create' && item.draft) || (item.kind === 'update' && item.transactionId);
          return (
            <Fragment key={item.id}>
              {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
              <View style={styles.row}>
                <Text style={[styles.summary, { color: colors.text }]}>{item.summary}</Text>
                <Text style={[styles.reason, { color: colors.textMuted }]}>{item.reason}</Text>
                <View style={styles.actions}>
                  {canFix ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Corriger : ${item.summary}`}
                      onPress={() => fix(item)}
                      style={styles.action}
                    >
                      <Text style={[styles.actionLabel, { color: colors.primary }]}>Corriger</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${canFix ? 'Abandonner' : 'Retirer'} : ${item.summary}`}
                    onPress={() => dismiss(item.id)}
                    style={styles.action}
                  >
                    <Text style={[styles.actionLabel, { color: colors.textMuted }]}>
                      {canFix ? 'Abandonner' : 'Retirer'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Fragment>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontFamily: font.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 14,
  },
  row: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    gap: 2,
  },
  summary: {
    fontFamily: font.semibold,
    fontSize: 16,
  },
  reason: {
    fontFamily: font.regular,
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: font.semibold,
    fontSize: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    marginHorizontal: spacing.md,
  },
});
