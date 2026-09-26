import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Link } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { BudgetsEntry } from "@/components/dashboard/budgets-entry";
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";
import { DebtsEntry } from "@/components/dashboard/debts-entry";
import { DueRecurring } from "@/components/dashboard/due-recurring";
import { WalletsEntry } from "@/components/dashboard/wallets-entry";
import { PendingTransactions } from "@/components/dashboard/pending-transactions";
import { PeriodSummary } from "@/components/dashboard/period-summary";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { SavingsEntry } from "@/components/dashboard/savings-entry";
import { AccountButton } from "@/components/ui/account-button";
import { Screen } from "@/components/ui/screen";
import {
  headerTitleStyle,
  ScreenHeader,
} from "@/components/ui/screen-header";
import { useActiveGroup } from "@/hooks/use-active-group";
import { useRecentTransactions } from "@/hooks/use-recent-transactions";
import { dataErrorMessage } from "@/lib/data-errors";
import { font, radius, spacing, useColors, useElevation } from "@/theme/tokens";

/**
 * Point d'entrée de la saisie, et vue de la période en cours : solde, écart avec la période précédente, répartition des dépenses, dernières opérations.
 *
 * Couvre la spec 2.6 hors sélecteur de période et vue multi-groupes, qui appartiennent respectivement à l'écran 3 et à l'écran 7.
 */
export default function DashboardScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const { activeGroup, error: groupError } = useActiveGroup();
  const {
    transactions,
    isLoading: transactionsLoading,
    error: transactionsError,
  } = useRecentTransactions();

  // Un chargement des adhésions en échec prime : sans groupe résolu, il n'y a rien de fiable à tirer des transactions (la requête est de toute façon désactivée tant qu'aucun groupe actif n'existe).
  const error = groupError ?? transactionsError;

  return (
    <Screen
      // Un tableau de bord se lit de haut en bas. Centré, il laissait plusieurs centaines de pixels de vide au-dessus du solde sur un grand écran, et repoussait l'information principale vers le milieu.
      align="top"
      inTabs
      header={
        /* Le nom du groupe est le titre de l'écran, et prend donc la police des titres d'en-tête (`headerTitleStyle`) : c'est lui qui répond à « de quel budget parlent ces chiffres ». En étiquette grise et menue, il se lisait comme une mention accessoire et la Synthèse paraissait sans titre à côté des autres onglets.

           Ouvre /groups (écran 7) : bascule de groupe actif, création, adhésion, gestion des membres. */
        <ScreenHeader
          title={
            <Link href="/groups" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Groupe actif : ${activeGroup?.name ?? "…"}. Gérer les groupes`}
                style={StyleSheet.flatten([styles.groupButton])}
              >
                <View
                  style={[styles.groupDot, { backgroundColor: colors.primary }]}
                />
                <Text
                  style={[styles.groupName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {activeGroup?.name ?? "…"}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={22}
                  color={colors.textMuted}
                />
              </Pressable>
            </Link>
          }
        >
          <AccountButton />
        </ScreenHeader>
      }
      floatingAlign="center"
      floatingAction={
        // La saisie en trois taps reste à portée depuis chaque onglet, comme sur la maquette.
        <Link href="/transaction" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter une opération"
            // Aplati : <Link asChild> transmet le style à son enfant et avertit s'il reçoit un tableau.
            style={StyleSheet.flatten([
              styles.fab,
              elevation.floating,
              { backgroundColor: colors.primary },
            ])}
          >
            <MaterialCommunityIcons name="plus" size={22} color={colors.primaryText} />
            <Text style={[styles.fabLabel, { color: colors.primaryText }]}>Ajouter</Text>
          </Pressable>
        </Link>
      }
    >
      {/* La carte porte ses propres états de chargement et d'erreur : un résumé en échec ne doit pas emporter la liste, qui a pu aboutir. */}
      <PeriodSummary />

      {/* Les échéances récurrentes arrivées, juste sous le solde qu'elles vont modifier, et avant les saisies en attente : une échéance demande une décision, une saisie en attente seulement du réseau. Ne rend rien quand rien n'est dû. */}
      <DueRecurring />

      {/* Juste sous le solde, que ces saisies ne comptent pas encore : c'est là que l'œil les cherche en revenant de la feuille, et la liste des dernières opérations est souvent sous la ligne de flottaison. Ne rend rien quand rien n'attend. */}
      <PendingTransactions />

      {/* Où est l'argent, juste sous ce qui en est entré et sorti : les deux soldes se lisent ensemble. */}
      <WalletsEntry />

      {/* Ne rend rien tant qu'aucune dépense n'existe sur la période : la liste voisine annonce déjà l'absence d'opérations, et un second état vide ne ferait que répéter la même chose. */}
      <CategoryBreakdown />

      <BudgetsEntry />

      <SavingsEntry />

      <DebtsEntry />

      <View style={styles.sectionRow}>
        <Text
          style={[styles.section, { color: colors.text }]}
          numberOfLines={1}
        >
          Dernières opérations
        </Text>
        {/* Ouvre l'historique aux filtres par défaut : période en cours, tous types, toutes catégories. La liste ci-dessous porte les mêmes bornes, donc « Tout voir » élargit sans jamais retirer une ligne déjà visible. */}
        <Link
          href="/history"
          style={[styles.sectionLink, { color: colors.primary }]}
        >
          Tout voir
        </Link>
      </View>

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]}>
          {dataErrorMessage(error)}
        </Text>
      ) : transactionsLoading ? (
        // Sans cette branche, le premier rendu affichait « Aucune opération » avant de basculer sur les données une fois arrivées : un faux état vide à chaque démarrage à froid.
        <ActivityIndicator color={colors.primary} />
      ) : (
        <RecentTransactions transactions={transactions} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  groupButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    // Cède la largeur au bouton de compte plutôt que de le pousser hors de l'écran avec un nom de groupe long.
    flexShrink: 1,
  },
  groupDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  groupName: {
    ...headerTitleStyle,
    flexShrink: 1,
  },
  section: {
    fontFamily: font.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    // Peut rétrécir jusqu'à tronquer plutôt que pousser « Tout voir » hors de l'écran à fort grossissement de police (RN met flexShrink à 0 par défaut).
    flexShrink: 1,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sectionLink: {
    fontFamily: font.semibold,
    fontSize: 14,
    // Garde sa largeur : c'est le seul accès à l'historique, il ne doit jamais céder de place au libellé qui le précède.
    flexShrink: 0,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 16,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    height: 52,
    borderRadius: radius.pill,
  },
  fabLabel: {
    fontFamily: font.bold,
    fontSize: 18,
  },
});
