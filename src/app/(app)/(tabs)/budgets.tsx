import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BudgetRow } from '@/components/budget/budget-row';
import { AccountButton } from '@/components/ui/account-button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen } from '@/components/ui/screen';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useBudgetProgress } from '@/hooks/use-budget-progress';
import { useBudgetTotals } from '@/hooks/use-budget-totals';
import { statusFor, type BudgetProgress } from '@/lib/budget-progress';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatPeriodLabel, periodBounds, todayIso } from '@/lib/dates';
import { formatAmount } from '@/lib/money';
import { periodProgress } from '@/lib/period-progress';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

type Filter = 'all' | 'tense' | 'calm';

function matches(item: BudgetProgress, filter: Filter): boolean {
  if (filter === 'tense') {
    return item.status !== 'ok';
  }
  if (filter === 'calm') {
    return item.status === 'ok';
  }
  return true;
}

/**
 * Budgets par catégorie (spec 2.4, écran 5), d'après la maquette Stitch `budgets_wazu_finance` : une synthèse de toutes les enveloppes, des filtres par état, puis une carte par enveloppe, les plus urgentes d'abord.
 *
 * La liste ne montre que les budgets définis : les quatorze catégories par défaut afficheraient douze lignes vides pour deux utiles. La découverte se fait à la création, qui classe les catégories sans budget par dépense réelle de la période.
 *
 * Les totaux de la synthèse viennent de budget_totals(), sommés par Postgres, sur les bornes de periodBounds() que les cartes utilisent aussi.
 *
 * Écarts assumés avec la maquette : pas de filtre « Frais fixes », la base ne distingue pas les dépenses fixes ; pas de mention « Comptabilité en partie double », l'app n'en tient pas.
 */
export default function BudgetsScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const router = useRouter();
  const { isLoading: groupLoading, error: groupError, activeGroupId, activeGroup } = useActiveGroup();
  const { items, isLoading, error, isEmptyError } = useBudgetProgress();
  const { totals } = useBudgetTotals();
  const [filter, setFilter] = useState<Filter>('all');

  // Seules bloquent les erreurs qui ne laissent rien de juste à montrer. TanStack garde les dernières données valides et ne remplit `error` qu'après l'échec d'un rafraîchissement en arrière-plan : revenir hors ligne au premier plan après plus de 30 s ne doit pas remplacer des budgets déjà affichés par un message d'erreur — même règle que activity.tsx.
  const blockingError: unknown =
    groupError !== null && activeGroupId === null ? groupError : isEmptyError ? error : null;

  const today = todayIso();
  const { from, to } = periodBounds(today, activeGroup?.periodStartDay ?? 1);
  const period = periodProgress(today, from, to);

  const tense = items.filter((item) => item.status !== 'ok').length;
  const visible = items.filter((item) => matches(item, filter));

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'Toutes', count: items.length },
    { id: 'tense', label: 'En tension', count: tense },
    { id: 'calm', label: 'Sous contrôle', count: items.length - tense },
  ];

  return (
    <Screen
      align="top"
      inTabs
      floatingAlign="center"
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
      <View style={styles.headerRow}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Enveloppes</Text>
          {items.length > 0 ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Triées par urgence, les enveloppes à risque d’abord
            </Text>
          ) : null}
        </View>
        <AccountButton />
      </View>

      {blockingError ? (
        // Si le chargement des adhésions échoue, `activeGroupId` reste `null` : `useBudgetProgress()` reste alors désactivé (ni chargement ni erreur) et sans ce garde l'écran afficherait à tort « Aucune enveloppe » au lieu du vrai message.
        <Text style={[styles.message, { color: colors.danger }]}>
          {dataErrorMessage(blockingError)}
        </Text>
      ) : isLoading || groupLoading ? (
        // Tant que le groupe actif n'est pas résolu, `useBudgets` et `useCategoryBreakdown` sont désactivées : leur `isLoading` reste à `false` et afficherait un instant « Aucune enveloppe » avant le premier vrai chargement.
        <ActivityIndicator color={colors.primary} />
      ) : items.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: colors.surface }, elevation.card]}>
          <MaterialCommunityIcons name="wallet-outline" size={32} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Aucune enveloppe pour l’instant</Text>
          <Text style={[styles.message, { color: colors.textMuted }]}>
            Fixez un plafond sur une catégorie : l’app vous alerte à 80 % et au dépassement.
          </Text>
          <NewEnvelopeButton />
        </View>
      ) : (
        <>
          {/* Filtres par état, d'après la maquette. Chaque pastille dit combien d'enveloppes elle garde. */}
          <View style={styles.chips}>
            {filters.map((option) => {
              const selected = option.id === filter;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${option.label}, ${option.count}`}
                  onPress={() => setFilter(option.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.text : colors.surface,
                      borderColor: selected ? colors.text : colors.border,
                    },
                  ]}
                >
                  {option.id === 'tense' ? (
                    <View style={[styles.dot, { backgroundColor: colors.danger }]} />
                  ) : null}
                  <Text
                    style={[styles.chipLabel, { color: selected ? colors.background : colors.text }]}
                  >
                    {option.label} ({option.count})
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Absente tant que les totaux chargent ou s'ils ont échoué : un total manquant vaut mieux qu'un total faux. */}
          {totals ? (
            <SummaryCard
              label={formatPeriodLabel(from, to)}
              spent={totals.spent}
              ceiling={totals.ceiling}
              remaining={totals.remaining}
              remainingDays={period.remainingDays}
              elapsedDays={period.elapsedDays}
            />
          ) : null}

          <View style={styles.sectionHead}>
            <Text style={[styles.section, { color: colors.text }]}>
              Répartition par enveloppe ({visible.length})
            </Text>
          </View>

          <View style={styles.list}>
            {visible.length === 0 ? (
              <Text style={[styles.message, { color: colors.textMuted }]}>
                {filter === 'tense'
                  ? 'Aucune enveloppe en tension. Tout est sous contrôle.'
                  : 'Aucune enveloppe sous contrôle pour l’instant.'}
              </Text>
            ) : (
              visible.map((item) => (
                <BudgetRow
                  key={item.budget.id}
                  item={item}
                  onPress={() => router.push(`/budget?id=${item.budget.id}`)}
                />
              ))
            )}
          </View>

          <NewEnvelopeButton />
        </>
      )}
    </Screen>
  );
}

/** Carte de synthèse : toutes les enveloppes de la période, d'après la maquette. */
function SummaryCard({
  label,
  spent,
  ceiling,
  remaining,
  remainingDays,
  elapsedDays,
}: {
  label: string;
  spent: number;
  ceiling: number;
  remaining: number;
  remainingDays: number;
  elapsedDays: number;
}) {
  const colors = useColors();
  const elevation = useElevation();

  // Deux totaux déjà sommés par Postgres, divisés une fois : ni la part ni la moyenne n'additionnent de montants.
  const ratio = ceiling === 0 ? 0 : spent / ceiling;
  const status = statusFor(ratio);
  const average = elapsedDays > 0 ? spent / elapsedDays : 0;

  return (
    <View style={[styles.summary, { backgroundColor: colors.surface }, elevation.card]}>
      <View style={styles.summaryHead}>
        <View style={styles.summaryTitleBlock}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Synthèse de la période</Text>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>Enveloppes {label}</Text>
        </View>
        {remainingDays > 0 ? (
          <View style={[styles.daysPill, { backgroundColor: colors.surfaceMuted }]}>
            <Text style={[styles.daysLabel, { color: colors.text }]}>
              {remainingDays === 1 ? 'Dernier jour' : `J-${remainingDays} avant clôture`}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.summaryFigures}>
        <View style={styles.summaryMain}>
          <Text style={[styles.summaryCaption, { color: colors.textMuted }]}>Consommé à ce jour</Text>
          <View style={styles.summaryAmountRow}>
            <Text
              style={[styles.summaryAmount, { color: colors.text }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {formatAmount(spent)} €
            </Text>
            <Text
              style={[
                styles.summaryPercent,
                { color: status === 'ok' ? colors.primary : status === 'warning' ? colors.warning : colors.danger },
              ]}
            >
              ({Math.round(ratio * 100)} %)
            </Text>
          </View>
        </View>
        <View style={styles.summarySide}>
          <Text style={[styles.summaryCaption, { color: colors.textMuted }]}>Plafond total</Text>
          <Text style={[styles.summaryCeiling, { color: colors.text }]}>{formatAmount(ceiling)} €</Text>
        </View>
      </View>

      <ProgressBar ratio={spent === 0 ? 0 : ratio} tone={status} size="lg" />

      <View style={styles.summaryFoot}>
        <Text
          style={[styles.summaryFootText, { color: remaining < 0 ? colors.danger : colors.textMuted }]}
        >
          {remaining < 0
            ? `Dépassement de ${formatAmount(Math.abs(remaining))} €`
            : `${formatAmount(remaining)} € disponibles`}
        </Text>
        {spent > 0 ? (
          <Text style={[styles.summaryFootText, { color: colors.textMuted }]}>
            Moyenne : {formatAmount(average)} € / jour
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function NewEnvelopeButton() {
  const colors = useColors();
  const elevation = useElevation();

  return (
    <Link href="/budget" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nouvelle enveloppe"
        // Aplati : voir le bouton flottant plus haut.
        style={StyleSheet.flatten([
          styles.newButton,
          elevation.card,
          { backgroundColor: colors.surface },
        ])}
      >
        <MaterialCommunityIcons name="plus-circle-outline" size={22} color={colors.primary} />
        <Text style={[styles.newLabel, { color: colors.text }]}>Nouvelle enveloppe</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  header: {
    gap: 3,
    flexShrink: 1,
  },
  title: {
    fontFamily: font.black,
    fontSize: 28,
    letterSpacing: -0.7,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 15.5,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md - 2,
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  chipLabel: {
    fontFamily: font.semibold,
    fontSize: 16,
  },
  summary: {
    gap: spacing.sm + 4,
    padding: spacing.md + 2,
    borderRadius: radius.lg,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryTitleBlock: {
    flexShrink: 1,
    gap: 2,
  },
  eyebrow: {
    fontFamily: font.semibold,
    fontSize: 14,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  summaryTitle: {
    fontFamily: font.bold,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  daysPill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  daysLabel: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
  summaryFigures: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryMain: {
    flexShrink: 1,
    gap: 2,
  },
  summaryCaption: {
    fontFamily: font.regular,
    fontSize: 15,
  },
  summaryAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs + 2,
  },
  summaryAmount: {
    fontFamily: font.black,
    fontSize: 32,
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  summaryPercent: {
    fontFamily: font.bold,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  summarySide: {
    alignItems: 'flex-end',
    gap: 2,
  },
  summaryCeiling: {
    fontFamily: font.bold,
    fontSize: 20,
    fontVariant: ['tabular-nums'],
  },
  summaryFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryFootText: {
    fontFamily: font.regular,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  sectionHead: {
    marginBottom: -spacing.sm,
  },
  section: {
    fontFamily: font.bold,
    fontSize: 15,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  list: {
    gap: spacing.md,
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
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
  },
  newLabel: {
    fontFamily: font.bold,
    fontSize: 18,
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
