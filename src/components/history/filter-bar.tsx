import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCategories } from '@/hooks/use-categories';
import type { PeriodPreset, PeriodPresetId } from '@/lib/dates';
import { font, radius, spacing, useColors } from '@/theme/tokens';
import type { TransactionType } from '@/types/database';

export type HistoryFilterState = {
  presetId: PeriodPresetId;
  type: TransactionType | null;
  categoryId: string | null;
};

/** État d'ouverture de l'écran : la période en cours, sans autre restriction. */
export const DEFAULT_FILTERS: HistoryFilterState = {
  presetId: 'current',
  type: null,
  categoryId: null,
};

const TYPE_CHOICES: { label: string; value: TransactionType | null }[] = [
  { label: 'Tout', value: null },
  { label: 'Dépenses', value: 'expense' },
  { label: 'Revenus', value: 'income' },
];

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surfaceMuted,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.chipLabel, { color: selected ? colors.primaryText : colors.textMuted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Trois contrôles empilés : période, type, catégorie.
 *
 * Ce sont des pastilles et non des `Button` : à 52 px de hauteur minimale
 * chacun, une rangée de boutons occuperait la moitié de l'écran.
 */
export function FilterBar({
  state,
  presets,
  effectiveCategoryId,
  onChange,
}: {
  state: HistoryFilterState;
  presets: PeriodPreset[];
  /** Catégorie corrigée par l'écran appelant : même valeur que celle qui alimente la requête. */
  effectiveCategoryId: string | null;
  onChange: (next: HistoryFilterState) => void;
}) {
  const colors = useColors();
  // Sert encore à afficher la liste des puces ; la correction d'une sélection
  // devenue invalide est désormais fournie par l'écran via `effectiveCategoryId`.
  const { categories } = useCategories(state.type);

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        {presets.map((preset) => (
          <Chip
            key={preset.id}
            label={preset.label}
            selected={state.presetId === preset.id}
            onPress={() => onChange({ ...state, presetId: preset.id })}
          />
        ))}
      </View>

      <View style={styles.row}>
        {TYPE_CHOICES.map((choice) => (
          <Chip
            key={choice.label}
            label={choice.label}
            selected={state.type === choice.value}
            onPress={() =>
              onChange({
                ...state,
                type: choice.value,
                // Une catégorie appartient à un seul type : passer à un type
                // concret ne peut conserver une sélection que par coïncidence,
                // donc on la vide. Repasser à « Tout » élargit l'offre sans
                // rien invalider, donc la sélection courante est conservée.
                categoryId: choice.value === null ? state.categoryId : null,
              })
            }
          />
        ))}
      </View>

      {/* Défilement horizontal dans une liste verticale : l'avertissement de
          React Native ne vise que l'imbrication sur le même axe. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollRow}
      >
        <Chip
          label="Toutes"
          selected={effectiveCategoryId === null}
          onPress={() => onChange({ ...state, categoryId: null })}
        />
        {categories.map((category) => (
          <Chip
            key={category.id}
            label={category.name}
            selected={effectiveCategoryId === category.id}
            onPress={() => onChange({ ...state, categoryId: category.id })}
          />
        ))}
      </ScrollView>

      <View style={[styles.rule, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  scrollRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    paddingRight: spacing.lg,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 4,
  },
  chipLabel: {
    fontFamily: font.semibold,
    fontSize: 12.5,
  },
  rule: {
    height: StyleSheet.hairlineWidth * 2,
    marginTop: spacing.xs,
  },
});
