import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CONTENT_GUTTER, contentColumn } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useActivity } from '@/hooks/use-activity';
import { useAuth } from '@/hooks/use-auth';
import { useCategories } from '@/hooks/use-categories';
import { useExportActivity } from '@/hooks/use-export-activity';
import { useFormerMembers } from '@/hooks/use-former-members';
import { useGroupMembers } from '@/hooks/use-group-members';
import { useWallets } from '@/hooks/use-wallets';
import {
  formatActivity,
  formatActivityTime,
  type ActivityContext,
} from '@/lib/activity-format';
import { dataErrorMessage } from '@/lib/data-errors';
import { departedAuthorName } from '@/lib/members';
import type { ActivityAction, ActivitySubject } from '@/types/database';
import { goBackOr } from '@/lib/navigation';
import { font, radius, spacing, useColors } from '@/theme/tokens';

// Référence stable, comme dans history.tsx.
function ItemSeparator() {
  return <View style={styles.separator} />;
}

/**
 * Journal du groupe actif : saisies, modifications et suppressions, prêts, portefeuilles et transferts, arrivées, départs et changements de rôle (migration full_activity_log). Exportable en PDF.
 *
 * N'utilise pas `Screen`, pour la même raison que l'historique : une `FlatList` dans un `ScrollView` perd sa virtualisation.
 */
export default function ActivityScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { isLoading: groupLoading, error: groupError, activeGroupId, activeGroup } = useActiveGroup();

  // Toutes les catégories, dépense et revenu : une entrée peut viser l'une ou l'autre. Tant qu'elles chargent, aucune phrase n'est rendue — sans elles, chaque entrée afficherait « catégorie supprimée » un instant.
  const {
    categories,
    isLoading: categoriesLoading,
    error: categoriesError,
    retry: retryCategories,
  } = useCategories(null);

  const { entries, isLoading, error, isEmptyError, isFetchingNextPage, loadMore, retry, refresh } =
    useActivity();

  // Les noms que le journal ne porte pas : les personnes visées par une arrivée, un départ ou un changement de rôle, et les portefeuilles d'un transfert. Les anciens membres d'abord, les actuels ensuite : quelqu'un qui est revenu garde son nom du moment.
  const shared = activeGroup !== null && !activeGroup.isPersonal;
  const { members } = useGroupMembers(shared ? (activeGroupId ?? '') : '');
  const former = useFormerMembers(activeGroupId ?? '', shared);
  const { wallets } = useWallets();
  const context = useMemo<ActivityContext>(
    () => ({
      names: new Map([
        ...former.map((member) => [member.userId, departedAuthorName(member.displayName)] as const),
        ...members.map((member) => [member.userId, member.displayName] as const),
      ]),
      wallets,
    }),
    [former, members, wallets]
  );

  const exportActivity = useExportActivity();
  const [exportError, setExportError] = useState<string>();

  const [refreshing, setRefreshing] = useState(false);

  const currentUserId = session?.user.id ?? null;

  function handleExport() {
    setExportError(undefined);
    exportActivity.mutate(
      { currentUserId, categories, context },
      { onError: (mutationError) => setExportError(dataErrorMessage(mutationError)) }
    );
  }

  // TanStack garde `data` et ne remplit `error` qu'après l'échec d'un rafraîchissement en arrière-plan : revenir hors ligne au premier plan après plus de 30 s ne doit donc pas remplacer un journal déjà chargé par la vue d'erreur plein écran. Une erreur ne bloque l'écran que si elle laisse l'utilisateur sans rien d'utile à voir : le groupe en erreur sans aucun groupe actif, ou les catégories en erreur sans aucune catégorie déjà chargée. Le journal lui-même garde son propre traitement plus bas (isEmptyError) : seul l'échec du tout premier chargement vide l'écran, celui d'une page suivante va en pied de liste.
  const groupBlockingError = groupError !== null && activeGroupId === null;
  const categoriesBlockingError = categoriesError !== null && categories.length === 0;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  function renderEmpty() {
    // La requête du journal est désactivée tant que le groupe actif n'est pas résolu : son `isLoading` reste à `false` et afficherait l'état vide.
    if (isLoading || groupLoading) {
      return <ActivityIndicator color={colors.primary} style={styles.centered} />;
    }

    return (
      <Text style={[styles.empty, styles.centered, { color: colors.textMuted }]}>
        Rien pour l’instant. Chaque saisie, modification ou suppression, et chaque arrivée ou départ
        d’un membre s’inscrira ici.
      </Text>
    );
  }

  function renderFooter() {
    if (isFetchingNextPage) {
      return <ActivityIndicator color={colors.primary} style={styles.footer} />;
    }

    if (error !== null && !isEmptyError) {
      return (
        <View style={styles.footer}>
          <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
          <Button title="Réessayer" variant="ghost" onPress={retry} />
        </View>
      );
    }

    return null;
  }

  function renderBody() {
    if (groupBlockingError) {
      // Même motif que budgets.tsx : sans groupe actif, il n'y a rien à réessayer que la résolution des adhésions elle-même, que ce bouton ne relance pas — les deux requêtes qu'il relancerait restent désactivées.
      return (
        <View style={styles.centered}>
          <Text style={[styles.error, { color: colors.danger }]}>
            {dataErrorMessage(groupError)}
          </Text>
        </View>
      );
    }

    if (categoriesBlockingError) {
      return (
        <View style={styles.centered}>
          <Text style={[styles.error, { color: colors.danger }]}>
            {dataErrorMessage(categoriesError)}
          </Text>
          <Button title="Réessayer" variant="ghost" onPress={retryCategories} />
        </View>
      );
    }

    if (isEmptyError) {
      return (
        <View style={styles.centered}>
          <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
          <Button
            title="Réessayer"
            variant="ghost"
            onPress={() => {
              retry();
              retryCategories();
            }}
          />
        </View>
      );
    }

    if (categoriesLoading) {
      return <ActivityIndicator color={colors.primary} style={styles.centered} />;
    }

    return (
      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.id}
        renderItem={({ item }) => {
          const glyph = entryGlyph(item.action, item.subject);

          return (
            <Card>
              <View style={styles.entry}>
                {/* La pastille dit l'action avant la phrase : dans un fil qu'on parcourt, la nature du changement se lit à la forme et à la couleur, sans attendre le verbe au milieu de la phrase. */}
                <View style={[styles.glyph, { backgroundColor: colors.surfaceMuted }]}>
                  <MaterialCommunityIcons
                    name={glyph.icon}
                    size={17}
                    color={
                      glyph.tone === 'danger'
                        ? colors.danger
                        : glyph.tone === 'positive'
                          ? colors.positive
                          : colors.warning
                    }
                  />
                </View>
                <View style={styles.entryText}>
                  <Text style={[styles.sentence, { color: colors.text }]}>
                    {formatActivity(item, currentUserId, categories, context)}
                  </Text>
                  <Text style={[styles.time, { color: colors.textMuted }]}>
                    {formatActivityTime(item.occurred_at)}
                  </Text>
                </View>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={renderEmpty()}
        ListFooterComponent={renderFooter()}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={() => {
          void handleRefresh();
        }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        ItemSeparatorComponent={ItemSeparator}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScreenHeader
        title="Activité"
        subtitle="Tout ce qui change dans le groupe"
        onBack={() => goBackOr(router, '/history')}
      >
        {/* Le journal entier en PDF, pour une réunion ou une archive. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Exporter le journal en PDF"
          accessibilityState={{ busy: exportActivity.isPending, disabled: exportActivity.isPending }}
          disabled={exportActivity.isPending || categoriesLoading}
          hitSlop={spacing.sm}
          onPress={handleExport}
          style={styles.exportButton}
        >
          {exportActivity.isPending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <MaterialCommunityIcons name="file-pdf-box" size={26} color={colors.primary} />
          )}
        </Pressable>
      </ScreenHeader>

      {exportError ? (
        <Text style={[styles.error, styles.exportError, { color: colors.danger }]}>{exportError}</Text>
      ) : null}

      {renderBody()}
    </View>
  );
}

type Glyph = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tone: 'positive' | 'warning' | 'danger';
};

/** Une arrivée ou une création en vert, une modification en orange, un départ ou une suppression en rouge. */
function entryGlyph(action: ActivityAction, subject: ActivitySubject): Glyph {
  if (subject === 'membership') {
    if (action === 'insert') {
      return { icon: 'account-plus-outline', tone: 'positive' };
    }
    return action === 'delete'
      ? { icon: 'account-remove-outline', tone: 'danger' }
      : { icon: 'account-switch-outline', tone: 'warning' };
  }
  if (subject === 'transfer') {
    return { icon: 'swap-horizontal', tone: 'positive' };
  }
  if (action === 'insert') {
    return { icon: 'plus', tone: 'positive' };
  }
  return action === 'delete'
    ? { icon: 'trash-can-outline', tone: 'danger' }
    : { icon: 'pencil-outline', tone: 'warning' };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  exportButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportError: {
    ...contentColumn,
    paddingHorizontal: CONTENT_GUTTER,
  },
  content: {
    // Même colonne que `Screen` et que l'en-tête ; voir history.tsx.
    ...contentColumn,
    paddingHorizontal: CONTENT_GUTTER,
    flexGrow: 1,
  },
  separator: {
    height: spacing.sm - 1,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
  },
  glyph: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  entryText: {
    gap: 2,
    flexShrink: 1,
  },
  sentence: {
    fontFamily: font.medium,
    fontSize: 16,
    lineHeight: 22,
  },
  time: {
    fontFamily: font.regular,
    fontSize: 14,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  empty: {
    fontFamily: font.regular,
    fontSize: 16,
    textAlign: 'center',
  },
  error: {
    fontFamily: font.medium,
    fontSize: 16,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
});
