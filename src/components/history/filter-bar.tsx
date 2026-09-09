import type { ReactNode } from 'react';
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

/**
 * Vrai tant qu'aucun filtre n'a été touché.
 *
 * Partagé entre la barre (qui décide d'afficher « Réinitialiser ») et l'écran
 * (qui choisit son message de liste vide) : deux comparaisons écrites
 * séparément finiraient par diverger d'un champ.
 */
export function isDefaultFilters(state: HistoryFilterState): boolean {
  return (
    state.presetId === DEFAULT_FILTERS.presetId &&
    state.type === DEFAULT_FILTERS.type &&
    state.categoryId === DEFAULT_FILTERS.categoryId
  );
}

const TYPE_CHOICES: { label: string; value: TransactionType | null }[] = [
  { label: 'Tout', value: null },
  { label: 'Dépenses', value: 'expense' },
  { label: 'Revenus', value: 'income' },
];

function Chip({
  label,
  group,
  selected,
  onPress,
}: {
  label: string;
  /** Nom du filtre, repris dans l'énoncé vocal : « Type : Tout ». */
  group: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      // Sans le nom du filtre, un lecteur d'écran annonce deux boutons
      // « Tout » sans rien pour les distinguer — l'étiquette de rubrique est
      // visuelle, elle ne rattache rien.
      accessibilityLabel={`${group} : ${label}`}
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
      <Text style={[styles.chipLabel, { color: selected ? colors.primaryText : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Une rubrique de filtre : son étiquette, puis ses pastilles.
 *
 * Sans étiquette, trois rangées de pastilles identiques ne disent pas sur quoi
 * elles portent — et « Tout » y apparaissait deux fois, pour la période et
 * pour le type.
 */
function Field({
  label,
  action,
  children,
}: {
  label: string;
  /** Contrôle aligné à droite de l'étiquette, si la rubrique en porte un. */
  action?: ReactNode;
  children: ReactNode;
}) {
  const colors = useColors();

  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

/**
 * Trois rubriques empilées : période, type, catégorie.
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
      <Field
        label="Période"
        action={
          // Visible seulement quand il y a quelque chose à défaire : un
          // contrôle qui ne ferait rien apprend au lecteur à l'ignorer.
          isDefaultFilters(state) ? undefined : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Réinitialiser les filtres"
              hitSlop={spacing.sm}
              onPress={() => onChange(DEFAULT_FILTERS)}
            >
              <Text style={[styles.reset, { color: colors.primary }]}>Réinitialiser</Text>
            </Pressable>
          )
        }
      >
        <View style={styles.row}>
          {presets.map((preset) => (
            <Chip
              key={preset.id}
              label={preset.label}
              group="Période"
              selected={state.presetId === preset.id}
              onPress={() => onChange({ ...state, presetId: preset.id })}
            />
          ))}
        </View>
      </Field>

      <Field label="Type">
        <View style={styles.row}>
          {TYPE_CHOICES.map((choice) => (
            <Chip
              key={choice.label}
              label={choice.label}
              group="Type"
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
      </Field>

      <Field label="Catégorie">
        {/* Défilement horizontal dans une liste verticale : l'avertissement de
            React Native ne vise que l'imbrication sur le même axe. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollRow}
        >
          <Chip
            label="Toutes"
            group="Catégorie"
            selected={effectiveCategoryId === null}
            onPress={() => onChange({ ...state, categoryId: null })}
          />
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              group="Catégorie"
              selected={effectiveCategoryId === category.id}
              onPress={() => onChange({ ...state, categoryId: category.id })}
            />
          ))}
        </ScrollView>
      </Field>

      <View style={[styles.rule, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  field: {
    gap: spacing.xs + 2,
  },
  fieldHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  fieldLabel: {
    fontFamily: font.semibold,
    fontSize: 10.5,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
  },
  reset: {
    fontFamily: font.semibold,
    fontSize: 12.5,
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md - 2,
  },
  chipLabel: {
    fontFamily: font.semibold,
    fontSize: 13,
  },
  rule: {
    height: StyleSheet.hairlineWidth * 2,
    marginTop: spacing.xs,
  },
});
