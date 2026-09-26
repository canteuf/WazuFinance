import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link, useRouter } from 'expo-router';
import { Fragment } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import type { DebtOverview } from '@/data/debts';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useCanWrite } from '@/hooks/use-can-write';
import { useDebts, useDebtTotals } from '@/hooks/use-debts';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatOccurredOn, todayIso } from '@/lib/dates';
import { formatMoney, spokenAmount } from '@/lib/money';
import { goBackOr } from '@/lib/navigation';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

/**
 * Prêts et dettes du groupe actif : ce qu'on doit au groupe, ce qu'il doit, et chaque dette avec son reste.
 *
 * Des sections plutôt qu'une liste mêlée : « on vous doit » et « vous devez » appellent deux gestes différents (relancer, rembourser), et les clients à qui la commerçante a vendu à crédit se suivent à part des proches. Les dettes soldées passent en dernier, sous leur propre titre : elles gardent l'historique sans encombrer ce qui reste à suivre.
 */
export default function DebtsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { activeGroup } = useActiveGroup();
  const { debts, isLoading, error } = useDebts();
  const { totals } = useDebtTotals();
  const canWrite = useCanWrite();

  const lent = debts.filter((debt) => debt.direction === 'lent' && debt.remaining > 0);
  const customers = debts.filter((debt) => debt.direction === 'credit_sale' && debt.remaining > 0);
  const borrowed = debts.filter((debt) => debt.direction === 'borrowed' && debt.remaining > 0);
  const settled = debts.filter((debt) => debt.remaining === 0);

  return (
    <Screen
      align="top"
      header={<ScreenHeader title="Prêts et dettes" onBack={() => goBackOr(router, '/')} />}
      floatingAlign="center"
      floatingAction={canWrite ? <NewDebtButton /> : undefined}
    >
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Dans « {activeGroup?.name ?? '…'} ». Un prêt fait baisser le solde, son remboursement le
        fait remonter ; ni l’un ni l’autre ne compte comme dépense ou revenu. Une vente à crédit
        n’entre qu’avec les versements du client, comptés en revenus « Commerce ».
      </Text>

      {totals ? (
        <View style={styles.totals}>
          <TotalCard label="On vous doit" amount={totals.owedToUs} positive />
          <TotalCard label="Vous devez" amount={totals.weOwe} />
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : error && debts.length === 0 ? (
        <Text style={[styles.message, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
      ) : debts.length === 0 ? (
        <Card>
          <View style={styles.empty}>
            <MaterialCommunityIcons name="handshake-outline" size={32} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Aucun prêt ni dette</Text>
            <Text style={[styles.message, { color: colors.textMuted }]}>
              {canWrite
                ? 'Touchez « Ajouter » pour noter l’argent prêté à un proche, emprunté, ou une vente à crédit.'
                : 'Aucun prêt ni dette n’est noté dans ce groupe.'}
            </Text>
          </View>
        </Card>
      ) : (
        <>
          <DebtSection title="On vous doit" debts={lent} />
          <DebtSection title="Clients à crédit" debts={customers} />
          <DebtSection title="Vous devez" debts={borrowed} />
          <DebtSection title="Soldés" debts={settled} />
        </>
      )}
    </Screen>
  );
}

function TotalCard({ label, amount, positive = false }: { label: string; amount: number; positive?: boolean }) {
  const colors = useColors();
  const elevation = useElevation();

  return (
    <View style={[styles.totalCard, { backgroundColor: colors.surface }, elevation.card]}>
      <Text style={[styles.totalLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[styles.totalValue, { color: positive ? colors.positive : colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {formatMoney(amount)}
      </Text>
    </View>
  );
}

function DebtSection({ title, debts }: { title: string; debts: DebtOverview[] }) {
  const colors = useColors();

  if (debts.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">
        {title} ({debts.length})
      </Text>
      <Card flush>
        {debts.map((debt, index) => (
          <Fragment key={debt.id}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
            <DebtRow debt={debt} />
          </Fragment>
        ))}
      </Card>
    </View>
  );
}

function DebtRow({ debt }: { debt: DebtOverview }) {
  const colors = useColors();
  const canWrite = useCanWrite();
  const settled = debt.remaining === 0;
  const late = !settled && debt.dueOn !== null && debt.dueOn < todayIso();

  const detail = settled
    ? `${debt.direction === 'credit_sale' ? 'Réglé' : 'Soldé'} · ${formatMoney(debt.amount)}`
    : `Reste ${formatMoney(debt.remaining)} sur ${formatMoney(debt.amount)}`;
  const due =
    debt.dueOn && !settled ? `${late ? 'En retard · ' : 'Échéance '}${formatOccurredOn(debt.dueOn)}` : null;

  const label = [
    debt.counterparty,
    settled ? 'soldé' : `reste ${spokenAmount(debt.remaining)} sur ${spokenAmount(debt.amount)}`,
    due,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <>
      <View style={styles.rowHead}>
        <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
          {debt.counterparty}
        </Text>
        <Text style={[styles.detail, { color: settled ? colors.textMuted : colors.text }]}>
          {detail}
        </Text>
      </View>
      <ProgressBar ratio={debt.paid / debt.amount} tone={settled ? 'muted' : 'positive'} />
      {due || debt.note ? (
        <Text
          numberOfLines={1}
          style={[styles.meta, { color: late ? colors.warning : colors.textMuted }]}
        >
          {[due, debt.note].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </>
  );

  // Un lecteur suit les dettes sans pouvoir enregistrer de remboursement : la ligne ne s'ouvre pas.
  if (!canWrite) {
    return (
      <View accessible accessibilityLabel={label} style={styles.row}>
        {content}
      </View>
    );
  }

  return (
    <Link href={`/debt?id=${debt.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={
          debt.direction === 'credit_sale'
            ? 'Ouvre la vente à crédit pour enregistrer un versement'
            : 'Ouvre la dette pour enregistrer un remboursement'
        }
        style={StyleSheet.flatten(styles.row)}
      >
        {content}
      </Pressable>
    </Link>
  );
}

function NewDebtButton() {
  const colors = useColors();
  const elevation = useElevation();

  return (
    <Link href="/debt" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ajouter un prêt ou une dette"
        // Aplati : <Link asChild> transmet le style par un Slot, qui refuse un tableau.
        style={StyleSheet.flatten([styles.fab, elevation.floating, { backgroundColor: colors.primary }])}
      >
        <MaterialCommunityIcons name="plus" size={22} color={colors.primaryText} />
        <Text style={[styles.fabLabel, { color: colors.primaryText }]}>Ajouter</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 22,
  },
  totals: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  totalCard: {
    flex: 1,
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  totalLabel: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
  totalValue: {
    fontFamily: font.bold,
    fontSize: 22,
    fontVariant: ['tabular-nums'],
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
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: font.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
  },
  row: {
    gap: spacing.xs + 2,
    minHeight: 64,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 17,
    flexShrink: 1,
  },
  detail: {
    fontFamily: font.medium,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  meta: {
    fontFamily: font.regular,
    fontSize: 14,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  fabLabel: {
    fontFamily: font.bold,
    fontSize: 17,
  },
});
