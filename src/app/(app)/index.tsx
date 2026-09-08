import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

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
 * Point d'entrée de la saisie, avec le solde de la période en cours.
 *
 * La répartition par catégorie et la comparaison entre périodes (spec 2.6)
 * restent à faire ; elles n'ont pas été retenues pour cette passe.
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
      <View style={styles.header}>
        <Text style={[styles.groupName, { color: colors.text }]}>{activeGroup?.name ?? '…'}</Text>
        {/* Le changement de groupe arrive à l'écran 7. Tant que ce contrôle
            n'existe pas, on n'affiche aucun repère visuel (ex. un chevron) qui
            laisserait croire à un bouton alors qu'il n'y a rien à toucher. */}
      </View>

      {/* La carte porte ses propres états de chargement et d'erreur : un
          résumé en échec ne doit pas emporter la liste, qui a pu aboutir. */}
      <PeriodSummary />

      <Text style={[styles.section, { color: colors.textMuted }]}>Dernières opérations</Text>

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
    gap: spacing.xs,
  },
  groupName: {
    fontFamily: font.black,
    fontSize: 26,
    letterSpacing: -0.6,
  },
  section: {
    fontFamily: font.semibold,
    fontSize: 11.5,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
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
