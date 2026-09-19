import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  activeFilterCount,
  DEFAULT_FILTERS,
  FilterBar,
  isDefaultFilters,
  type HistoryFilterState,
} from '@/components/history/filter-bar';
import { TransactionRow } from '@/components/transaction/transaction-row';
import { AccountButton } from '@/components/ui/account-button';
import { Button } from '@/components/ui/button';
import type { TransactionFilters } from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useCategories } from '@/hooks/use-categories';
import { useDailyTotals } from '@/hooks/use-daily-totals';
import { useTransactionHistory } from '@/hooks/use-transaction-history';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatPeriodLabel, periodPresets, todayIso } from '@/lib/dates';
import { dayTitle, groupByDay } from '@/lib/ledger';
import { formatDelta } from '@/lib/money';
import { normalizeSearch } from '@/lib/search';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

/** Délai entre la dernière frappe et la requête : taper « biocoop » ne doit pas en lancer sept. */
const SEARCH_DELAY_MS = 300;

/**
 * Historique du groupe actif, en livre de comptes, d'après la maquette Stitch `historique_des_op_rations_wazu_finance` : les opérations groupées par jour, chaque jour avec son total.
 *
 * N'utilise pas `Screen` : celui-ci enveloppe un `ScrollView`, et imbriquer une liste virtualisée dans un `ScrollView` désactive la virtualisation — une liste paginée garderait alors toutes ses lignes montées.
 *
 * Les totaux de jour viennent de daily_totals(), sous les mêmes filtres que la liste, et non d'une somme des lignes chargées : la liste est paginée, et un jour à cheval sur deux pages aurait un total faux.
 *
 * Écarts assumés avec la maquette : pas de moyen de paiement (« Carte bancaire », « Prélèvement ») sous les opérations, la base n'en enregistre pas.
 */
export default function HistoryScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const insets = useSafeAreaInsets();
  const { activeGroup, isLoading: groupLoading } = useActiveGroup();

  // État local à l'écran : aucun autre n'en dépend, et le sortir d'ici obligerait à décider quand le remettre à zéro entre deux visites.
  const [filters, setFilters] = useState<HistoryFilterState>(DEFAULT_FILTERS);

  // La recherche part vers la base avec un temps de retard sur la frappe ; les autres filtres, eux, s'appliquent au premier appui.
  const [search, setSearch] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(normalizeSearch(filters.search)), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const today = todayIso();
  const presets = periodPresets(today, activeGroup?.periodStartDay ?? 1);
  const preset = presets.find((item) => item.id === filters.presetId) ?? presets[0];

  const { categories, isLoading: categoriesLoading } = useCategories(filters.type);

  // La correction vit ici, pas dans `FilterBar` : c'est l'écran qui possède l'état à partir duquel la requête est construite, donc la sélection corrigée doit être calculée là où cet état est lu — sinon les pastilles et la requête peuvent diverger (groupe actif changé, catégorie supprimée par un autre membre pendant que l'écran reste monté).
  const effectiveCategoryId =
    filters.categoryId !== null &&
    !categoriesLoading &&
    !categories.some((category) => category.id === filters.categoryId)
      ? null
      : filters.categoryId;

  // Un seul objet de filtres pour la liste et pour les totaux : les en-têtes de jour doivent décrire exactement les lignes affichées dessous.
  const queryFilters: TransactionFilters = {
    from: preset.from,
    to: preset.to,
    categoryId: effectiveCategoryId,
    type: filters.type,
    search,
  };

  const {
    transactions,
    isLoading,
    error,
    isEmptyError,
    hasNextPage,
    isFetchingNextPage,
    loadMore,
    retry,
  } = useTransactionHistory(queryFilters);
  const { totals } = useDailyTotals(queryFilters);

  const sections = useMemo(() => groupByDay(transactions), [transactions]);

  // Somme de nombres d'écritures, pas de montants : des entiers, que JavaScript additionne exactement.
  const entryCount = totals
    ? Array.from(totals.values()).reduce((count, day) => count + day.count, 0)
    : undefined;

  const filtersTouched = !isDefaultFilters(filters);
  const touchedCount = activeFilterCount(filters);
  const ledgerTitle =
    preset.from && preset.to
      ? `Livre de comptes ${formatPeriodLabel(preset.from, preset.to)}`
      : 'Livre de comptes, depuis le début';

  function renderEmpty() {
    // Tant que le groupe actif n'est pas résolu, la requête d'historique est désactivée : `isLoading` reste à `false` et affichait un instant « Aucune opération » avant le premier vrai chargement.
    if (isLoading || groupLoading) {
      return <ActivityIndicator color={colors.primary} style={styles.centered} />;
    }

    // Deux messages distincts : un message unique ferait croire à une disparition des données là où il n'y a qu'un filtre trop étroit.
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
        Aucune opération sur cette période.
      </Text>
    );
  }

  function renderFooter() {
    if (isFetchingNextPage) {
      return <ActivityIndicator color={colors.primary} style={styles.footer} />;
    }

    // Échec d'une page suivante : le message va en pied, les lignes déjà chargées restent affichées.
    if (error !== null && !isEmptyError) {
      return (
        <View style={styles.footer}>
          <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
          <Button title="Réessayer" variant="ghost" onPress={retry} />
        </View>
      );
    }

    // Dit que la liste est complète, plutôt que de laisser croire qu'une page tarde à venir.
    if (!hasNextPage && transactions.length > 0) {
      return (
        <View style={[styles.footer, styles.endRow]}>
          <MaterialCommunityIcons name="check-circle-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.endLabel, { color: colors.textMuted }]}>
            Fin des écritures pour cette sélection
          </Text>
        </View>
      );
    }

    return null;
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Pas de bouton retour : l'écran est une destination d'onglet, pas une page empilée. */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Opérations</Text>
        {/* C'est ici qu'on vient vérifier ses opérations ; le tableau de bord porte déjà assez d'éléments. */}
        <Link href="/activity" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Journal du groupe"
            hitSlop={spacing.sm}
            // Aplati : <Link asChild> transmet le style par un Slot, qui lève une erreur de rendu en développement s'il reçoit un tableau.
            style={StyleSheet.flatten(styles.headerLink)}
          >
            <Text style={[styles.headerLinkLabel, { color: colors.primary }]}>Journal</Text>
          </Pressable>
        </Link>
        <AccountButton />
      </View>

      {/* `isEmptyError` ne vaut vrai que pour l'échec du premier chargement (voir use-transaction-history.ts) : un refetch en arrière-plan qui échoue sur un filtre légitimement vide ne doit pas faire disparaître la barre de filtres, seule issue pour l'élargir. */}
      {isEmptyError ? (
        <View style={styles.centered}>
          <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
          <Button title="Réessayer" variant="ghost" onPress={retry} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(transaction) => transaction.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => {
            const day = totals?.get(section.date);
            return (
              <View style={styles.dayHead}>
                <Text style={[styles.dayTitle, { color: colors.text }]}>
                  {dayTitle(section.date, today)}
                </Text>
                {/* Absent tant que les totaux chargent ou s'ils ont échoué : un total manquant vaut mieux qu'un total faux. */}
                {day ? (
                  <Text
                    style={[
                      styles.dayTotal,
                      { color: day.total > 0 ? colors.positive : colors.text },
                    ]}
                  >
                    Total : {formatDelta(day.total)} €
                  </Text>
                ) : null}
              </View>
            );
          }}
          renderItem={({ item, index, section }) => {
            const first = index === 0;
            const last = index === section.data.length - 1;
            // Chaque jour se lit comme une seule carte : la première et la dernière ligne portent ses coins arrondis, un filet sépare les autres.
            return (
              <View
                style={[
                  styles.dayCard,
                  { backgroundColor: colors.surface },
                  first && styles.dayCardFirst,
                  last && [styles.dayCardLast, elevation.card],
                ]}
              >
                {first ? null : (
                  <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                )}
                <TransactionRow transaction={item} inGroup ledger />
              </View>
            );
          }}
          ListHeaderComponent={
            <View style={styles.listHead}>
              <FilterBar
                state={filters}
                presets={presets}
                effectiveCategoryId={effectiveCategoryId}
                onChange={setFilters}
              />
              {filtersTouched ? (
                <View style={styles.filterStatus}>
                  <Text style={[styles.filterCount, { color: colors.textMuted }]}>
                    {touchedCount === 1 ? '1 filtre actif' : `${touchedCount} filtres actifs`}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Réinitialiser les filtres"
                    hitSlop={spacing.sm}
                    onPress={() => setFilters(DEFAULT_FILTERS)}
                  >
                    <Text style={[styles.reset, { color: colors.primary }]}>Réinitialiser</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.ledgerHead}>
                <MaterialCommunityIcons name="book-open-variant" size={18} color={colors.primary} />
                <Text style={[styles.ledgerTitle, { color: colors.text }]} numberOfLines={1}>
                  {ledgerTitle}
                </Text>
                {entryCount !== undefined ? (
                  <View style={[styles.countPill, { backgroundColor: colors.surfaceMuted }]}>
                    <Text style={[styles.countLabel, { color: colors.text }]}>
                      {entryCount === 1 ? '1 écriture' : `${entryCount} écritures`}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          }
          ListEmptyComponent={renderEmpty()}
          ListFooterComponent={renderFooter()}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={styles.content}
        />
      )}

      {/* La spec 4.3 impose la saisie en trois taps depuis l'écran principal, mais l'historique est l'endroit où l'on constate un oubli : obliger à revenir en arrière irait contre la contrainte. Pilule centrée, comme sur la maquette. */}
      <Link href="/transaction" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajouter une opération"
          style={StyleSheet.flatten([
            styles.fab,
            elevation.floating,
            { backgroundColor: colors.primary },
          ])}
        >
          <MaterialCommunityIcons name="plus" size={22} color={colors.primaryText} />
          <Text style={[styles.fabLabel, { color: colors.primaryText }]}>Saisie</Text>
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
    // À grande taille de police, le lien passe à la ligne au lieu de sortir de l'écran.
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 24,
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  headerLink: {
    // Pousse le lien au bord droit de l'en-tête.
    marginLeft: 'auto',
  },
  headerLinkLabel: {
    fontFamily: font.semibold,
    fontSize: 16,
  },
  content: {
    paddingHorizontal: spacing.lg,
    // Dégage la pilule « Saisie », qui flotte au-dessus du bas de la liste.
    paddingBottom: spacing.xl * 3,
    flexGrow: 1,
  },
  listHead: {
    gap: spacing.sm,
  },
  filterStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  filterCount: {
    fontFamily: font.medium,
    fontSize: 15,
  },
  reset: {
    fontFamily: font.semibold,
    fontSize: 15,
  },
  ledgerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  ledgerTitle: {
    flex: 1,
    fontFamily: font.semibold,
    fontSize: 14.5,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  countPill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  countLabel: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  dayTitle: {
    fontFamily: font.bold,
    fontSize: 20,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  dayTotal: {
    fontFamily: font.bold,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  dayCard: {
    overflow: 'hidden',
  },
  dayCardFirst: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  dayCardLast: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth * 2,
    marginHorizontal: spacing.md,
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
  endRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  endLabel: {
    fontFamily: font.regular,
    fontSize: 15,
  },
  fab: {
    position: 'absolute',
    // L'écran est un onglet : la barre d'onglets occupe déjà le bas et sa zone sûre, la pilule se cale juste au-dessus.
    bottom: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  fabLabel: {
    fontFamily: font.bold,
    fontSize: 18,
  },
});
