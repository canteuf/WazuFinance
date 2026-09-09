import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BudgetsEntry } from '@/components/dashboard/budgets-entry';
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown';
import { PeriodSummary } from '@/components/dashboard/period-summary';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import { useRecentTransactions } from '@/hooks/use-recent-transactions';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

/**
 * Point d'entrée de la saisie, et vue de la période en cours : solde, écart
 * avec la période précédente, répartition des dépenses, dernières opérations.
 *
 * Couvre la spec 2.6 hors sélecteur de période et vue multi-groupes, qui
 * appartiennent respectivement à l'écran 3 et à l'écran 7.
 */
export default function DashboardScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const { signOut } = useAuth();
  const { activeGroup, error: groupError } = useActiveGroup();
  const { transactions, isLoading: transactionsLoading, error: transactionsError } =
    useRecentTransactions();

  // Un chargement des adhésions en échec prime : sans groupe résolu, il n'y a
  // rien de fiable à tirer des transactions (la requête est de toute façon
  // désactivée tant qu'aucun groupe actif n'existe).
  const error = groupError ?? transactionsError;

  return (
    <Screen
      // Un tableau de bord se lit de haut en bas. Centré, il laissait
      // plusieurs centaines de pixels de vide au-dessus du solde sur un grand
      // écran, et repoussait l'information principale vers le milieu.
      align="top"
      floatingAction={
        <Link href="/transaction" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter une opération"
            // Aplati : <Link asChild> transmet le style à son enfant et avertit
            // s'il reçoit un tableau.
            style={StyleSheet.flatten([
              styles.fab,
              elevation.floating,
              { backgroundColor: colors.primary },
            ])}
          >
            <Text style={[styles.fabLabel, { color: colors.primaryText }]}>+</Text>
          </Pressable>
        </Link>
      }
    >
      {/* Le nom du groupe est une étiquette, pas un titre : c'est le solde
          qui domine l'écran. Le mettre en grand inversait la hiérarchie et
          faisait passer l'information principale au second plan.

          Le changement de groupe arrive à l'écran 7. Tant que ce contrôle
          n'existe pas, on n'affiche aucun repère visuel (ex. un chevron) qui
          laisserait croire à un bouton alors qu'il n'y a rien à toucher. */}
      <View style={styles.header}>
        <View style={[styles.groupDot, { backgroundColor: colors.primary }]} />
        <Text style={[styles.groupName, { color: colors.textMuted }]}>
          {activeGroup?.name ?? '…'}
        </Text>
      </View>

      {/* La carte porte ses propres états de chargement et d'erreur : un
          résumé en échec ne doit pas emporter la liste, qui a pu aboutir. */}
      <PeriodSummary />

      {/* Ne rend rien tant qu'aucune dépense n'existe sur la période : la liste
          voisine annonce déjà l'absence d'opérations, et un second état vide ne
          ferait que répéter la même chose. */}
      <CategoryBreakdown />

      <BudgetsEntry />

      <View style={styles.sectionRow}>
        <Text
          style={[styles.section, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          Dernières opérations
        </Text>
        {/* Ouvre l'historique aux filtres par défaut : période en cours, tous
            types, toutes catégories. La liste ci-dessous porte les mêmes
            bornes, donc « Tout voir » élargit sans jamais retirer une ligne
            déjà visible. */}
        <Link href="/history" style={[styles.sectionLink, { color: colors.primary }]}>
          Tout voir
        </Link>
      </View>

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
      ) : transactionsLoading ? (
        // Sans cette branche, le premier rendu affichait « Aucune opération »
        // avant de basculer sur les données une fois arrivées : un faux état
        // vide à chaque démarrage à froid.
        <ActivityIndicator color={colors.primary} />
      ) : (
        <RecentTransactions transactions={transactions} />
      )}

      <Button title="Se déconnecter" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  groupName: {
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 0.66,
    textTransform: 'uppercase',
  },
  section: {
    fontFamily: font.semibold,
    fontSize: 10.5,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
    // Peut rétrécir jusqu'à tronquer plutôt que pousser « Tout voir » hors de
    // l'écran à fort grossissement de police (RN met flexShrink à 0 par défaut).
    flexShrink: 1,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionLink: {
    fontFamily: font.semibold,
    fontSize: 12,
    // Garde sa largeur : c'est le seul accès à l'historique, il ne doit
    // jamais céder de place au libellé qui le précède.
    flexShrink: 0,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 14,
  },
  fab: {
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
