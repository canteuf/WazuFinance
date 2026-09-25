import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link, useRouter } from 'expo-router';
import { Fragment } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { recurringTitle } from '@/components/dashboard/due-recurring';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useRecurring } from '@/hooks/use-recurring';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatOccurredOn } from '@/lib/dates';
import { formatSigned, spokenAmount } from '@/lib/money';
import { goBackOr } from '@/lib/navigation';
import { describeRecurrence } from '@/lib/recurrence';
import { categoryTone } from '@/theme/category-colors';
import { font, radius, spacing, useColors, useIsDark } from '@/theme/tokens';

/**
 * Toutes les opérations récurrentes du groupe actif, la prochaine échéance d'abord. Toucher une ligne ouvre sa feuille : enregistrer l'échéance, la passer, ou supprimer la répétition.
 *
 * On en crée depuis la saisie ordinaire (« Répéter », sous la date et la note) : c'est là que l'on a le loyer en tête, et l'opération saisie est la première occurrence.
 */
export default function RecurringListScreen() {
  const colors = useColors();
  const isDark = useIsDark();
  const router = useRouter();
  const { activeGroup } = useActiveGroup();
  const { recurring, isLoading, error } = useRecurring();

  return (
    <Screen
      align="top"
      header={<ScreenHeader title="Opérations récurrentes" onBack={() => goBackOr(router, '/')} />}
    >
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Proposées à chaque échéance dans la Synthèse de « {activeGroup?.name ?? '…'} », à confirmer
        d’un geste. Rien n’entre au solde sans votre accord.
      </Text>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : error && recurring.length === 0 ? (
        <Text style={[styles.message, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
      ) : recurring.length === 0 ? (
        <Card>
          <View style={styles.empty}>
            <MaterialCommunityIcons name="calendar-sync" size={32} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Aucune opération récurrente</Text>
            <Text style={[styles.message, { color: colors.textMuted }]}>
              Pour le loyer, la tontine ou la scolarité : saisissez l’opération, touchez « Ajouter une
              note ou changer la date », puis choisissez « Mois » ou « Semaine » sous « Répéter ».
            </Text>
          </View>
        </Card>
      ) : (
        <Card flush>
          {recurring.map((item, index) => {
            const icon = item.category?.icon ?? 'repeat';
            const tone = categoryTone({ id: item.category_id ?? item.id, icon }, isDark);
            const title = recurringTitle(item);
            const rhythm = describeRecurrence(item.frequency, item.anchor_day);
            return (
              <Fragment key={item.id}>
                {index > 0 ? (
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                ) : null}
                <Link href={`/recurring?id=${item.id}`} asChild>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${title}, ${item.type === 'income' ? 'revenu' : 'dépense'} de ${spokenAmount(Number(item.amount))}, ${rhythm.toLowerCase()}, prochaine échéance ${formatOccurredOn(item.next_due_on)}`}
                    style={StyleSheet.flatten(styles.row)}
                  >
                    <View style={[styles.glyph, { backgroundColor: tone.surface }]}>
                      <MaterialCommunityIcons
                        name={icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                        size={19}
                        color={tone.tint}
                      />
                    </View>
                    <View style={styles.text}>
                      <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                        {title}
                      </Text>
                      <Text style={[styles.meta, { color: colors.textMuted }]}>
                        {rhythm} · prochaine : {formatOccurredOn(item.next_due_on)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.amount,
                        { color: item.type === 'income' ? colors.positive : colors.text },
                      ]}
                    >
                      {formatSigned(Number(item.amount), item.type)}
                    </Text>
                  </Pressable>
                </Link>
              </Fragment>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 22,
  },
  message: {
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  emptyTitle: {
    fontFamily: font.bold,
    fontSize: 19,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: 64,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 17,
  },
  meta: {
    fontFamily: font.regular,
    fontSize: 14,
  },
  amount: {
    fontFamily: font.semibold,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
});
