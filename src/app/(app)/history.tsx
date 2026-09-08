import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DEFAULT_FILTERS,
  FilterBar,
  type HistoryFilterState,
} from '@/components/history/filter-bar';
import { TransactionRow } from '@/components/transaction/transaction-row';
import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useTransactionHistory } from '@/hooks/use-transaction-history';
import { dataErrorMessage } from '@/lib/data-errors';
import { periodPresets, todayIso } from '@/lib/dates';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

/**
 * Historique complet du groupe actif.
 *
 * N'utilise pas `Screen` : celui-ci enveloppe un `ScrollView`, et imbriquer une
 * `FlatList` dans un `ScrollView` désactive la virtualisation — une liste
 * paginée garderait alors toutes ses lignes montées.
 */
export default function HistoryScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeGroup } = useActiveGroup();

  // État local à l'écran : aucun autre n'en dépend, et le sortir d'ici
  // obligerait à décider quand le remettre à zéro entre deux visites.
  const [filters, setFilters] = useState<HistoryFilterState>(DEFAULT_FILTERS);

  const presets = periodPresets(todayIso(), activeGroup?.periodStartDay ?? 1);
  const preset = presets.find((item) => item.id === filters.presetId) ?? presets[0];

  const {
    transactions,
    isLoading,
    error,
    isEmptyError,
    isFetchingNextPage,
    loadMore,
    retry,
    // `hasNextPage` n'est pas repris : `loadMore` s'en garde lui-même, et une
    // variable déstructurée mais inutilisée fait échouer le lint.
  } = useTransactionHistory({
    from: preset.from,
    to: preset.to,
    categoryId: filters.categoryId,
    type: filters.type,
  });

  const filtersTouched =
    filters.presetId !== DEFAULT_FILTERS.presetId ||
    filters.type !== DEFAULT_FILTERS.type ||
    filters.categoryId !== DEFAULT_FILTERS.categoryId;

  function renderEmpty() {
    if (isLoading) {
      return <ActivityIndicator color={colors.primary} style={styles.centered} />;
    }

    // Deux messages distincts : un message unique ferait croire à une
    // disparition des données là où il n'y a qu'un filtre trop étroit.
    if (filtersTouched) {
      return (
        <View style={styles.centered}>
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            Aucune opération avec ces filtres.
          </Text>
          <Button
            title="Réinitialiser les filtres"
            variant="ghost"
            onPress={() => setFilters(DEFAULT_FILTERS)}
          />
        </View>
      );
    }

    return (
      <Text style={[styles.empty, styles.centered, { color: colors.textMuted }]}>
        Aucune opération pour l’instant.
      </Text>
    );
  }

  function renderFooter() {
    if (isFetchingNextPage) {
      return <ActivityIndicator color={colors.primary} style={styles.footer} />;
    }

    // Échec d'une page suivante : le message va en pied, les lignes déjà
    // chargées restent affichées.
    if (error !== null && !isEmptyError) {
      return (
        <View style={styles.footer}>
          <Text style={[styles.error, { color: colors.danger }]}>
            {dataErrorMessage(error)}
          </Text>
          <Button title="Réessayer" variant="ghost" onPress={retry} />
        </View>
      );
    }

    return null;
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
        <Text style={[styles.title, { color: colors.text }]}>Opérations</Text>
      </View>

      {isEmptyError ? (
        <View style={styles.centered}>
          <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
          <Button title="Réessayer" variant="ghost" onPress={retry} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(transaction) => transaction.id}
          renderItem={({ item }) => <TransactionRow transaction={item} />}
          ListHeaderComponent={
            <FilterBar state={filters} presets={presets} onChange={setFilters} />
          }
          ListEmptyComponent={renderEmpty()}
          ListFooterComponent={renderFooter()}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xl * 2 },
          ]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* La spec 4.3 impose la saisie en trois taps depuis l'écran principal,
          mais l'historique est l'endroit où l'on constate un oubli : obliger à
          revenir en arrière irait contre la contrainte. */}
      <Link href="/transaction" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajouter une opération"
          style={StyleSheet.flatten([
            styles.fab,
            elevation.floating,
            { backgroundColor: colors.primary, bottom: insets.bottom + spacing.lg },
          ])}
        >
          <Text style={[styles.fabLabel, { color: colors.primaryText }]}>+</Text>
        </Pressable>
      </Link>
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
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.lg + 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabLabel: {
    fontFamily: font.medium,
    fontSize: 30,
    lineHeight: 34,
  },
});
