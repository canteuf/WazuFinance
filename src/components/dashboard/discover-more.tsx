import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link, type Href } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import type { DashboardSection } from '@/hooks/use-dashboard-sections';
import { declaredUsage } from '@/lib/onboarding';
import { font, spacing, useColors } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type Entry = { key: DashboardSection | 'shared'; icon: IconName; title: string; hint: string; href: Href };

const ENTRIES: Record<DashboardSection | 'shared', Entry> = {
  shared: {
    key: 'shared',
    icon: 'account-group-outline',
    title: 'Partager un budget',
    hint: 'Tenir les comptes avec votre famille ou votre tontine',
    href: '/groups',
  },
  wallets: {
    key: 'wallets',
    icon: 'wallet-outline',
    title: 'Portefeuilles',
    hint: 'Séparer espèces, mobile money et banque',
    href: '/wallets',
  },
  budgets: {
    key: 'budgets',
    icon: 'chart-donut-variant',
    title: 'Budgets',
    hint: 'Un plafond par catégorie, avec une alerte à 80 %',
    href: '/budgets',
  },
  savings: {
    key: 'savings',
    icon: 'piggy-bank-outline',
    title: 'Épargne',
    hint: 'Mettre de côté pour un projet',
    href: '/savings-goals',
  },
  debts: {
    key: 'debts',
    icon: 'handshake-outline',
    title: 'Prêts et dettes',
    hint: 'L’argent prêté, emprunté ou vendu à crédit',
    href: '/debts',
  },
};

/**
 * « Aller plus loin » : une ligne par fonction pas encore utilisée, à la place des cartes vides de la Synthèse (voir `useDashboardSections`).
 *
 * « Partager un budget » n'y figure que tant que la personne n'a aucun budget partagé, et passe en tête si elle a choisi « En famille » ou « Ma tontine » à l'accueil. Ne rend rien quand tout est déjà utilisé.
 */
export function DiscoverMore({ hidden }: { hidden: DashboardSection[] }) {
  const colors = useColors();
  const { session } = useAuth();
  const { groups } = useActiveGroup();

  const hasShared = groups.some((group) => !group.isPersonal);
  const usage = declaredUsage(session?.user.user_metadata);
  const sharedFirst = usage === 'family' || usage === 'tontine';

  const sections = hidden.map((key) => ENTRIES[key]);
  const entries = hasShared
    ? sections
    : sharedFirst
      ? [ENTRIES.shared, ...sections]
      : [...sections, ENTRIES.shared];

  if (entries.length === 0) {
    return null;
  }

  return (
    <Card flush>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        Aller plus loin
      </Text>
      {entries.map((entry, index) => (
        <Fragment key={entry.key}>
          {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
          <Link href={entry.href} asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${entry.title}. ${entry.hint}`}
              // Un style statique, comme les autres liens de l'app : <Link asChild> le passe par un Slot, qui refuse un tableau en développement.
              style={styles.row}
            >
              <View style={[styles.glyph, { backgroundColor: colors.surfaceMuted }]}>
                <MaterialCommunityIcons name={entry.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.text}>
                <Text style={[styles.title, { color: colors.text }]}>{entry.title}</Text>
                <Text style={[styles.hint, { color: colors.textMuted }]}>{entry.hint}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>
          </Link>
        </Fragment>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: font.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 56,
  },
  glyph: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: font.semibold,
    fontSize: 17,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 15,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    marginHorizontal: spacing.md,
  },
});
