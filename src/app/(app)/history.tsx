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
  isDefaultFilters,
  type HistoryFilterState,
} from '@/components/history/filter-bar';
import { TransactionRow } from '@/components/transaction/transaction-row';
import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useCategories } from '@/hooks/use-categories';
import { useTransactionHistory } from '@/hooks/use-transaction-history';
import { dataErrorMessage } from '@/lib/data-errors';
import { periodPresets, todayIso } from '@/lib/dates';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

// Référence stable : une fonction inline recréée à chaque rendu ferait de
// chaque séparateur un composant neuf, monté puis démonté à chaque frappe.
function ItemSeparator() {
  return <View style={styles.separator} />;
}

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
  const { activeGroup, isLoading: groupLoading } = useActiveGroup();

  // État local à l'écran : aucun autre n'en dépend, et le sortir d'ici
  // obligerait à décider quand le remettre à zéro entre deux visites.
  const [filters, setFilters] = useState<HistoryFilterState>(DEFAULT_FILTERS);

  const presets = periodPresets(todayIso(), activeGroup?.periodStartDay ?? 1);
  const preset = presets.find((item) => item.id === filters.presetId) ?? presets[0];

  const { categories, isLoading: categoriesLoading } = useCategories(filters.type);

  // La correction vit ici, pas dans `FilterBar` : c'est l'écran qui possède
  // l'état à partir duquel la requête est construite, donc la sélection
  // corrigée doit être calculée là où cet état est lu, pas seulement là où il
  // est affiché — sinon les puces et la requête peuvent diverger (groupe actif
  // changé, catégorie supprimée par un autre membre pendant que l'écran reste
  // monté).
  const effectiveCategoryId =
    filters.categoryId !== null &&
    !categoriesLoading &&
    !categories.some((category) => category.id === filters.categoryId)
      ? null
      : filters.categoryId;

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
    categoryId: effectiveCategoryId,
    type: filters.type,
  });

  const filtersTouched = !isDefaultFilters(filters);

  function renderEmpty() {
    // Tant que le groupe actif n'est pas résolu, la requête d'historique est
    // désactivée : `isLoading` reste à `false` et affichait un instant
    // « Aucune opération » avant le premier vrai chargement.
    if (isLoading || groupLoading) {
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
        {/* C'est ici qu'on vient vérifier ses opérations ; le tableau de bord
            porte déjà assez d'éléments. */}
        <Link href="/activity" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Activité du groupe"
            hitSlop={spacing.sm}
            // Aplati : <Link asChild> transmet le style par un Slot, qui lève
            // une erreur de rendu en développement s'il reçoit un tableau.
            style={StyleSheet.flatten(styles.headerLink)}
          >
            <Text style={[styles.headerLinkLabel, { color: colors.primary }]}>Activité</Text>
          </Pressable>
        </Link>
      </View>

      {/* `isEmptyError` ne vaut vrai que pour l'échec du premier chargement
          (voir use-transaction-history.ts) : un refetch en arrière-plan qui
          échoue sur un filtre légitimement vide ne doit pas faire disparaître
          la barre de filtres, seule issue pour l'élargir. */}
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
            <FilterBar
              state={filters}
              presets={presets}
              effectiveCategoryId={effectiveCategoryId}
              onChange={setFilters}
            />
          }
          ListEmptyComponent={renderEmpty()}
          ListFooterComponent={renderFooter()}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xl * 2 },
          ]}
          ItemSeparatorComponent={ItemSeparator}
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
  headerLink: {
    // Pousse le lien au bord droit de l'en-tête.
    marginLeft: 'auto',
  },
  headerLinkLabel: {
    fontFamily: font.semibold,
    fontSize: 14,
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
