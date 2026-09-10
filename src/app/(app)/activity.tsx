import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useActivity } from '@/hooks/use-activity';
import { useAuth } from '@/hooks/use-auth';
import { useCategories } from '@/hooks/use-categories';
import { formatActivity, formatActivityTime } from '@/lib/activity-format';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, radius, spacing, useColors } from '@/theme/tokens';

// Référence stable, comme dans history.tsx.
function ItemSeparator() {
  return <View style={styles.separator} />;
}

/**
 * Journal des modifications et suppressions du groupe actif.
 *
 * N'utilise pas `Screen`, pour la même raison que l'historique : une
 * `FlatList` dans un `ScrollView` perd sa virtualisation.
 */
export default function ActivityScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { isLoading: groupLoading, error: groupError } = useActiveGroup();

  // Toutes les catégories, dépense et revenu : une entrée peut viser l'une ou
  // l'autre. Tant qu'elles chargent, aucune phrase n'est rendue — sans elles,
  // chaque entrée afficherait « catégorie supprimée » un instant.
  const {
    categories,
    isLoading: categoriesLoading,
    error: categoriesError,
    retry: retryCategories,
  } = useCategories(null);

  const { entries, isLoading, error, isEmptyError, isFetchingNextPage, loadMore, retry, refresh } =
    useActivity();

  const [refreshing, setRefreshing] = useState(false);

  const currentUserId = session?.user.id ?? null;

  // Seul l'échec du premier chargement vide l'écran ; celui d'une page
  // suivante va en pied de liste.
  const blockingError: unknown = groupError || categoriesError || (isEmptyError ? error : null);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  function renderEmpty() {
    // La requête du journal est désactivée tant que le groupe actif n'est pas
    // résolu : son `isLoading` reste à `false` et afficherait l'état vide.
    if (isLoading || groupLoading) {
      return <ActivityIndicator color={colors.primary} style={styles.centered} />;
    }

    return (
      <Text style={[styles.empty, styles.centered, { color: colors.textMuted }]}>
        Aucune modification ni suppression pour l’instant.
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
    if (blockingError) {
      return (
        <View style={styles.centered}>
          <Text style={[styles.error, { color: colors.danger }]}>
            {dataErrorMessage(blockingError)}
          </Text>
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
        renderItem={({ item }) => (
          <View
            style={[styles.entry, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.sentence, { color: colors.text }]}>
              {formatActivity(item, currentUserId, categories)}
            </Text>
            <Text style={[styles.time, { color: colors.textMuted }]}>
              {formatActivityTime(item.occurred_at)}
            </Text>
          </View>
        )}
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
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={spacing.sm}
          onPress={() => router.back()}
        >
          <Text style={[styles.back, { color: colors.textMuted }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Activité</Text>
      </View>

      {renderBody()}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
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
  content: {
    paddingHorizontal: spacing.lg,
    flexGrow: 1,
  },
  separator: {
    height: spacing.sm - 1,
  },
  entry: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  sentence: {
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  time: {
    fontFamily: font.regular,
    fontSize: 12,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  empty: {
    fontFamily: font.regular,
    fontSize: 14,
    textAlign: 'center',
  },
  error: {
    fontFamily: font.medium,
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
});
