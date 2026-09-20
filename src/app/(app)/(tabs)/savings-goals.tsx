import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SavingsGoalRow } from '@/components/savings/savings-goal-row';
import { AccountButton } from '@/components/ui/account-button';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useSavingsGoals } from '@/hooks/use-savings-goals';
import { useSavingsOverview } from '@/hooks/use-savings-overview';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatAmount } from '@/lib/money';
import { savingsProgress } from '@/lib/savings-progress';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

/**
 * Objectifs d'épargne (spec 2.5, écran 6), d'après la maquette Stitch `objectifs_d_pargne_wazu_finance`.
 *
 * Portée personnelle : useSavingsGoals() ne prend aucun paramètre de groupe, la policy RLS ne renvoie déjà que les objectifs de l'utilisateur courant.
 *
 * Le total provisionné et l'effort mensuel viennent de savings_overview(), sommés par Postgres : additionner les montants ici passerait par des flottants binaires.
 *
 * Écarts assumés avec la maquette : pas de catégorie d'objectif (« Sécurité », « Loisirs »), la base n'en enregistre pas ; « Capacité mensuelle » devient « Effort mensuel », parce que le chiffre est ce qu'il faut mettre de côté chaque mois pour tenir les échéances, pas ce qu'on peut se permettre.
 */
export default function SavingsGoalsScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const router = useRouter();
  const { goals, isLoading, error, isLoadingError } = useSavingsGoals();
  const { overview } = useSavingsOverview();
  const { activeGroup } = useActiveGroup();

  const items = useMemo(() => goals.map(savingsProgress), [goals]);
  const active = items.filter((item) => item.status === 'in_progress');
  const reached = items.filter((item) => item.status === 'reached');

  // Seul l'échec du tout premier chargement bloque l'écran : TanStack garde les dernières données valides après un rafraîchissement raté en arrière-plan — même règle que budgets.tsx et activity.tsx.
  const blockingError: unknown = isLoadingError ? error : null;

  const counts = [
    active.length === 1 ? '1 projet en cours' : `${active.length} projets en cours`,
    reached.length > 0 ? (reached.length === 1 ? '1 atteint' : `${reached.length} atteints`) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  function open(id: string) {
    router.push(`/savings-goal?id=${id}`);
  }

  return (
    <Screen
      align="top"
      inTabs
      floatingAlign="center"
      header={
        <ScreenHeader title="Objectifs d’épargne">
          <AccountButton />
        </ScreenHeader>
      }
      floatingAction={
        // La saisie en trois taps reste à portée depuis chaque onglet, comme sur la maquette.
        <Link href="/transaction" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter une opération"
            // Aplati : <Link asChild> transmet le style à son enfant via un Slot, qui lève une erreur de rendu en développement s'il reçoit un tableau.
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
      }
    >
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          {items.length > 0 ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>{counts}</Text>
          ) : null}
          {/* Le groupe actif ne s'applique pas ici : sans cette mention, sélectionner un groupe partagé et y retrouver ses objectifs laisse croire qu'ils y sont partagés. */}
          <View style={styles.scope}>
            <MaterialCommunityIcons name="lock-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.scopeLabel, { color: colors.textMuted }]}>
              {activeGroup && !activeGroup.isPersonal
                ? `Personnel · non partagé avec « ${activeGroup.name} »`
                : 'Personnel · visible par vous seul'}
            </Text>
          </View>
        </View>
        <Link href="/savings-goal" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nouvel objectif"
            style={StyleSheet.flatten([styles.newButton, { backgroundColor: colors.primary }])}
          >
            <MaterialCommunityIcons name="plus" size={18} color={colors.primaryText} />
            <Text style={[styles.newLabel, { color: colors.primaryText }]}>Nouvel objectif</Text>
          </Pressable>
        </Link>
      </View>

      {/* Absent tant que les totaux chargent ou s'ils ont échoué : un total manquant vaut mieux qu'un total faux. */}
      {overview && items.length > 0 ? (
        <View style={[styles.summary, { backgroundColor: colors.surfaceMuted }]}>
          <View style={styles.summaryMain}>
            <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Total provisionné</Text>
            <Text
              style={[styles.total, { color: colors.primary }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {formatAmount(overview.totalSaved)} €
            </Text>
          </View>
          {overview.monthlyEffort > 0 ? (
            <View style={styles.summarySide}>
              <Text style={[styles.sideLabel, { color: colors.textMuted }]}>Effort mensuel</Text>
              <Text style={[styles.sideValue, { color: colors.text }]}>
                +{formatAmount(overview.monthlyEffort)} €/mois
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {blockingError ? (
        <Text style={[styles.message, { color: colors.danger }]}>
          {dataErrorMessage(blockingError)}
        </Text>
      ) : isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : items.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: colors.surface }, elevation.card]}>
          <MaterialCommunityIcons name="piggy-bank-outline" size={32} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Aucun objectif pour l’instant</Text>
          <Text style={[styles.message, { color: colors.textMuted }]}>
            Fixez une cible, une échéance si vous en avez une, puis versez au fil des mois.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {active.map((item) => (
            <SavingsGoalRow
              key={item.goal.id}
              item={item}
              rhythm={overview?.rhythms.get(item.goal.id)}
              onPress={() => open(item.goal.id)}
            />
          ))}

          {reached.length > 0 ? (
            <>
              <Text style={[styles.section, { color: colors.text }]}>
                {reached.length === 1 ? 'Objectif atteint' : 'Objectifs atteints'}
              </Text>
              {reached.map((item) => (
                <SavingsGoalRow
                  key={item.goal.id}
                  item={item}
                  rhythm={undefined}
                  onPress={() => open(item.goal.id)}
                />
              ))}
            </>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Le bouton passe sous le titre à grande taille de police plutôt que de le comprimer.
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titleBlock: {
    flexShrink: 1,
    gap: 2,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 16,
  },
  scope: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  scopeLabel: {
    flexShrink: 1,
    fontFamily: font.medium,
    fontSize: 15,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: radius.pill,
  },
  newLabel: {
    fontFamily: font.bold,
    fontSize: 17,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  summaryMain: {
    flexShrink: 1,
    gap: 2,
  },
  eyebrow: {
    fontFamily: font.semibold,
    fontSize: 14,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  total: {
    fontFamily: font.black,
    fontSize: 34,
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  summarySide: {
    alignItems: 'flex-end',
    gap: 2,
  },
  sideLabel: {
    fontFamily: font.regular,
    fontSize: 15,
  },
  sideValue: {
    fontFamily: font.bold,
    fontSize: 19,
    fontVariant: ['tabular-nums'],
  },
  list: {
    gap: spacing.md,
  },
  section: {
    fontFamily: font.bold,
    fontSize: 15,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  emptyTitle: {
    fontFamily: font.bold,
    fontSize: 19,
  },
  message: {
    fontFamily: font.regular,
    fontSize: 16,
    textAlign: 'center',
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
