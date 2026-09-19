import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useSavingsGoals } from '@/hooks/use-savings-goals';
import { formatAmount } from '@/lib/money';
import { savingsProgress } from '@/lib/savings-progress';
import { font, spacing, stackAtFontScale, useColors } from '@/theme/tokens';

/** Objectifs détaillés sur le tableau de bord avant de renvoyer à l'onglet. */
const PREVIEW_COUNT = 2;

/**
 * Résume les objectifs d'épargne en une phrase.
 *
 * Même formule que BudgetsEntry, avec une seule dimension (atteint ou non) au lieu de deux (dépassé/proche) : la spec 2.5 ne demande pas de palier d'alerte comme la 2.4 le fait pour les budgets.
 */
function summarise(total: number, reached: number): string {
  if (total === 0) {
    return 'À définir';
  }
  const base = total === 1 ? '1 objectif suivi' : `${total} objectifs suivis`;
  if (reached === 0) {
    return base;
  }
  return `${base}, ${reached === 1 ? '1 atteint' : `${reached} atteints`}`;
}

export function SavingsEntry() {
  const colors = useColors();
  const { fontScale } = useWindowDimensions();
  const { goals, isLoading, error } = useSavingsGoals();
  const { activeGroup } = useActiveGroup();
  const sharedGroupName = activeGroup && !activeGroup.isPersonal ? activeGroup.name : null;

  const items = goals.map(savingsProgress);
  const reached = items.filter((item) => item.status === 'reached').length;

  // Au-delà du seuil, le libellé et le détail s'empilent plutôt que de se disputer la largeur — comme les autres rangées à deux colonnes du projet.
  const stacked = fontScale >= stackAtFontScale;

  const accent = reached > 0 ? colors.positive : colors.textMuted;
  // TanStack Query garde les dernières données valides quand un refetch en arrière-plan échoue : tant que `goals` contient quelque chose, on montre l'état du dernier succès plutôt qu'un « Voir » neutre — même motif que BudgetsEntry.
  const detail =
    (isLoading || error) && goals.length === 0 ? 'Voir' : summarise(items.length, reached);

  // Les plus avancés d'abord : c'est l'ordre que `savings-goals.tsx` applique déjà, et celui qui rend l'aperçu encourageant plutôt que décourageant.
  const preview = items.slice(0, PREVIEW_COUNT);

  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.cardHead}>
          <View style={styles.cardTitle}>
            <MaterialCommunityIcons name="piggy-bank-outline" size={18} color={colors.primary} />
            <Text style={[styles.heading, { color: colors.text }]}>Épargne</Text>
          </View>
          <Link href="/savings-goals" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Objectifs d’épargne. ${detail}`}
            >
              <Text style={[styles.link, { color: colors.primary }]}>Tout voir</Text>
            </Pressable>
          </Link>
        </View>
        {/* Seulement sous un groupe partagé : c'est là que voir ses objectifs au milieu des chiffres communs laisse croire qu'ils sont partagés. Sur le compte personnel la mention n'apprendrait rien. */}
        {sharedGroupName ? (
          <View style={styles.scope}>
            <MaterialCommunityIcons name="lock-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.scopeLabel, { color: colors.textMuted }]}>
              Personnel · non partagé avec « {sharedGroupName} »
            </Text>
          </View>
        ) : null}
      </View>

      {preview.length === 0 ? (
        <Text style={[styles.detail, { color: accent }]}>{detail}</Text>
      ) : (
        <View style={styles.rows}>
          {preview.map((item) => {
            const remaining = item.goal.target_amount - item.goal.current_amount;

            return (
              <View key={item.goal.id} style={styles.row}>
                <View style={[styles.rowHead, stacked && styles.rowHeadStacked]}>
                  <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                    {item.goal.name}
                  </Text>
                  <Text
                    style={[
                      styles.amounts,
                      {
                        color:
                          item.status === 'reached' ? colors.positive : colors.textMuted,
                      },
                    ]}
                  >
                    {formatAmount(item.goal.current_amount)} /{' '}
                    {formatAmount(item.goal.target_amount)} €
                  </Text>
                </View>
                <ProgressBar
                  ratio={item.goal.current_amount === 0 ? 0 : item.percent / 100}
                  tone={item.status === 'reached' ? 'positive' : 'accent'}
                />
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {item.status === 'reached'
                    ? 'Atteint'
                    : `Reste ${formatAmount(remaining)} € · ${item.percent} %`}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  scope: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  scopeLabel: {
    flexShrink: 1,
    fontFamily: font.medium,
    fontSize: 14,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  heading: {
    fontFamily: font.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  link: {
    fontFamily: font.semibold,
    fontSize: 15,
    flexShrink: 0,
  },
  rows: {
    gap: spacing.md,
  },
  row: {
    gap: spacing.xs + 2,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowHeadStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 16,
    flexShrink: 1,
  },
  amounts: {
    fontFamily: font.semibold,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  meta: {
    fontFamily: font.medium,
    fontSize: 13.5,
    fontVariant: ['tabular-nums'],
  },
  detail: {
    fontFamily: font.medium,
    fontSize: 15,
    flexShrink: 1,
  },
});
