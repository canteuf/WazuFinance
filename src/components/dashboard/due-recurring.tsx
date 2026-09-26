import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Card } from '@/components/ui/card';
import type { RecurringWithCategory } from '@/data/recurring';
import { useCanWrite } from '@/hooks/use-can-write';
import { useRecurring } from '@/hooks/use-recurring';
import { useRecurringMutations } from '@/hooks/use-recurring-mutations';
import { useRequestIds } from '@/hooks/use-request-ids';
import { useToast } from '@/hooks/use-toast';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatOccurredOn, todayIso } from '@/lib/dates';
import { formatSigned, spokenAmount } from '@/lib/money';
import { categoryTone } from '@/theme/category-colors';
import { font, radius, spacing, stackAtFontScale, useColors, useIsDark } from '@/theme/tokens';

/** Titre d'une récurrence : sa note (« Loyer ») si elle en a une, sinon sa catégorie. Même règle que TransactionRow. */
export function recurringTitle(item: RecurringWithCategory): string {
  return item.note?.trim() || item.category?.name || 'Sans catégorie';
}

/**
 * Les opérations récurrentes arrivées à échéance, en tête de la Synthèse.
 *
 * Rien n'entre au solde sans accord : une tontine reportée ou un loyer payé en retard ne doit pas compter le jour prévu. Chaque ligne s'enregistre d'un geste au montant prévu, ou se passe ; la toucher ouvre la feuille qui permet d'ajuster le montant de cette fois.
 *
 * L'opération est datée du jour de la confirmation, pas de l'échéance : c'est le jour où l'argent est vraiment sorti. La feuille permet de faire autrement.
 */
export function DueRecurring() {
  const colors = useColors();
  const { due } = useRecurring();
  const { confirm, skip } = useRecurringMutations();
  const toast = useToast();
  // Un identifiant par échéance, pas par toucher : après une réponse perdue, le second « Enregistrer » retrouve l'opération créée par le premier. Un nouvel identifiant à chaque toucher faisait lire « déjà traitée par un autre membre » à celui qui venait de la traiter.
  const transactionIdFor = useRequestIds();
  const canWrite = useCanWrite();

  // Confirmer ou passer une échéance est une écriture : un lecteur n'a pas de décision à prendre ici.
  if (due.length === 0 || !canWrite) {
    return null;
  }

  function handleConfirm(item: RecurringWithCategory) {
    confirm.mutate(
      {
        id: item.id,
        dueOn: item.next_due_on,
        transactionId: transactionIdFor(`${item.id}:${item.next_due_on}`),
        amount: null,
        occurredOn: todayIso(),
      },
      {
        onSuccess: () => toast.show(`Échéance « ${recurringTitle(item)} » enregistrée`),
        onError: (error) => toast.show(dataErrorMessage(error), 'error'),
      }
    );
  }

  function handleSkip(item: RecurringWithCategory) {
    skip.mutate(
      { id: item.id, dueOn: item.next_due_on },
      {
        onSuccess: () => toast.show(`Échéance « ${recurringTitle(item)} » passée`, 'info'),
        onError: (error) => toast.show(dataErrorMessage(error), 'error'),
      }
    );
  }

  // Une ligne à la fois : pendant l'envoi, ses deux boutons se désactivent, ceux des autres restent actifs.
  const busyId =
    (confirm.isPending ? confirm.variables?.id : undefined) ??
    (skip.isPending ? skip.variables?.id : undefined);

  return (
    <View style={styles.block}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="calendar-clock" size={20} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          À confirmer ({due.length})
        </Text>
        <Link href="/recurring-list" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gérer les opérations récurrentes"
            hitSlop={spacing.sm}
          >
            <Text style={[styles.manage, { color: colors.primary }]}>Gérer</Text>
          </Pressable>
        </Link>
      </View>
      <Card flush>
        {due.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
            <DueRow
              item={item}
              busy={busyId === item.id}
              onConfirm={() => handleConfirm(item)}
              onSkip={() => handleSkip(item)}
            />
          </Fragment>
        ))}
      </Card>
    </View>
  );
}

function DueRow({
  item,
  busy,
  onConfirm,
  onSkip,
}: {
  item: RecurringWithCategory;
  busy: boolean;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  const colors = useColors();
  const isDark = useIsDark();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= stackAtFontScale;

  const icon = item.category?.icon ?? 'repeat';
  const tone = categoryTone({ id: item.category_id ?? item.id, icon }, isDark);
  const title = recurringTitle(item);
  const late = item.next_due_on < todayIso();

  return (
    <View style={styles.row}>
      <Link href={`/recurring?id=${item.id}`} asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${item.type === 'income' ? 'revenu' : 'dépense'} de ${spokenAmount(Number(item.amount))}, échéance ${formatOccurredOn(item.next_due_on)}`}
          accessibilityHint="Ouvre l’échéance pour ajuster le montant ou la date"
          style={StyleSheet.flatten([styles.main, stacked && styles.mainStacked])}
        >
          <View style={[styles.glyph, { backgroundColor: tone.surface }]}>
            <MaterialCommunityIcons
              name={icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
              size={19}
              color={tone.tint}
            />
          </View>
          <View style={styles.text}>
            <Text numberOfLines={stacked ? 2 : 1} style={[styles.name, { color: colors.text }]}>
              {title}
            </Text>
            <Text style={[styles.due, { color: late ? colors.warning : colors.textMuted }]}>
              {late ? 'En retard · ' : ''}
              {formatOccurredOn(item.next_due_on)}
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
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Passer ${title} cette fois`}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onSkip}
          style={({ pressed }) => [
            styles.action,
            { borderColor: colors.border, opacity: busy ? 0.5 : pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.actionLabel, { color: colors.text }]}>Passer</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Enregistrer ${title}`}
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.action,
            styles.actionPrimary,
            { backgroundColor: colors.primary, opacity: busy ? 0.5 : pressed ? 0.85 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="check" size={18} color={colors.primaryText} />
          <Text style={[styles.actionLabel, { color: colors.primaryText }]}>Enregistrer</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: font.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
  },
  manage: {
    fontFamily: font.semibold,
    fontSize: 16,
    paddingVertical: spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
  },
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  mainStacked: {
    flexWrap: 'wrap',
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
  due: {
    fontFamily: font.regular,
    fontSize: 14,
  },
  amount: {
    fontFamily: font.semibold,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  actionPrimary: {
    borderWidth: 0,
  },
  actionLabel: {
    fontFamily: font.bold,
    fontSize: 16,
  },
});
