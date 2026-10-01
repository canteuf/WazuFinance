import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link, useRouter } from 'expo-router';
import { Fragment } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryCreator } from '@/components/transaction/category-creator';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import type { Category, CategoryUsage } from '@/data/categories';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useCanWrite } from '@/hooks/use-can-write';
import { useCategories, useCategoryUsage } from '@/hooks/use-categories';
import { usageLabel } from '@/lib/category-usage';
import { dataErrorMessage } from '@/lib/data-errors';
import { goBackOr } from '@/lib/navigation';
import { categoryTone } from '@/theme/category-colors';
import { font, radius, spacing, useColors, useIsDark } from '@/theme/tokens';
import type { TransactionType } from '@/types/database';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const SECTIONS: { type: TransactionType; title: string }[] = [
  { type: 'expense', title: 'Dépenses' },
  { type: 'income', title: 'Revenus' },
];

/**
 * Catégories créées dans le groupe actif, par type : combien d'opérations chacune porte, et l'accès à sa fiche pour la renommer, changer son icône ou la supprimer. Les catégories par défaut, communes à tous, ne se gèrent pas et ne sont pas listées.
 *
 * Ouvert depuis Paramètres. Un lecteur n'y accède pas : il ne peut rien y changer.
 */
export default function CategoriesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { activeGroup } = useActiveGroup();
  const canWrite = useCanWrite();
  const { categories, isLoading, error } = useCategories(null);
  const { usage } = useCategoryUsage();
  const own = categories.filter((category) => category.group_id !== null);

  return (
    <Screen
      align="top"
      header={<ScreenHeader title="Catégories" onBack={() => goBackOr(router, '/settings')} />}
    >
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Celles créées dans « {activeGroup?.name ?? '…'} ». Les catégories par défaut sont communes à
        tous et ne se modifient pas.
      </Text>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : error && categories.length === 0 ? (
        <Text style={[styles.message, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
      ) : (
        SECTIONS.map((section) => {
          const items = own.filter((category) => category.type === section.type);
          return (
            <View key={section.type} style={styles.section}>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
                {section.title}
              </Text>
              {items.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textMuted }]}>
                  Aucune catégorie de {section.type === 'expense' ? 'dépense' : 'revenu'} créée.
                </Text>
              ) : (
                <Card flush>
                  {items.map((category, index) => (
                    <Fragment key={category.id}>
                      {index > 0 ? (
                        <View style={[styles.divider, { backgroundColor: colors.border }]} />
                      ) : null}
                      <CategoryRow category={category} usage={usage?.get(category.id)} canWrite={canWrite} />
                    </Fragment>
                  ))}
                </Card>
              )}
              {/* Sans onCreated à faire : la catégorie apparaît dans la liste, qui lit le même cache. */}
              {canWrite ? <CategoryCreator type={section.type} onCreated={() => undefined} /> : null}
            </View>
          );
        })
      )}
    </Screen>
  );
}

function CategoryRow({
  category,
  usage,
  canWrite,
}: {
  category: Category;
  usage: CategoryUsage | undefined;
  canWrite: boolean;
}) {
  const colors = useColors();
  const isDark = useIsDark();
  const tone = categoryTone(category, isDark);
  const meta = usageLabel(usage);

  const content = (
    <>
      <View style={[styles.glyph, { backgroundColor: tone.surface }]}>
        <MaterialCommunityIcons name={category.icon as IconName} size={20} color={tone.tint} />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
          {category.name}
        </Text>
        {meta ? <Text style={[styles.meta, { color: colors.textMuted }]}>{meta}</Text> : null}
      </View>
      {canWrite ? <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} /> : null}
    </>
  );

  if (!canWrite) {
    return (
      <View accessible accessibilityLabel={[category.name, meta].filter(Boolean).join(', ')} style={styles.row}>
        {content}
      </View>
    );
  }

  return (
    <Link href={{ pathname: '/category', params: { id: category.id } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[category.name, meta].filter(Boolean).join(', ')}
        accessibilityHint="Ouvre la catégorie pour la renommer, changer son icône ou la supprimer"
        // Aplati : <Link asChild> transmet le style par un Slot, qui lève une erreur de rendu en développement s'il reçoit un tableau.
        style={StyleSheet.flatten(styles.row)}
      >
        {content}
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
  message: {
    fontFamily: font.regular,
    fontSize: 16,
    textAlign: 'center',
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: font.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
  },
  empty: {
    fontFamily: font.regular,
    fontSize: 15,
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
});
