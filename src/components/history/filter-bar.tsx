import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useCategories } from '@/hooks/use-categories';
import type { PeriodPreset, PeriodPresetId } from '@/lib/dates';
import { font, radius, spacing, useColors } from '@/theme/tokens';
import type { TransactionType } from '@/types/database';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export type HistoryFilterState = {
  presetId: PeriodPresetId;
  type: TransactionType | null;
  categoryId: string | null;
  /** Texte tel que tapé ; l'écran le normalise et le temporise avant la requête. */
  search: string;
};

/** État d'ouverture de l'écran : la période en cours, sans autre restriction. */
export const DEFAULT_FILTERS: HistoryFilterState = {
  presetId: 'current',
  type: null,
  categoryId: null,
  search: '',
};

/**
 * Vrai tant qu'aucun filtre n'a été touché.
 *
 * Partagé entre l'écran (qui décide d'afficher « Réinitialiser » et choisit son message de liste vide) et quiconque doit le savoir : deux comparaisons écrites séparément finiraient par diverger d'un champ.
 */
export function isDefaultFilters(state: HistoryFilterState): boolean {
  return (
    state.presetId === DEFAULT_FILTERS.presetId &&
    state.type === DEFAULT_FILTERS.type &&
    state.categoryId === DEFAULT_FILTERS.categoryId &&
    state.search.trim() === ''
  );
}

/** Nombre de filtres qui s'écartent du défaut, pour « 2 filtres actifs ». */
export function activeFilterCount(state: HistoryFilterState): number {
  return [
    state.presetId !== DEFAULT_FILTERS.presetId,
    state.type !== null,
    state.categoryId !== null,
    state.search.trim() !== '',
  ].filter(Boolean).length;
}

type Panel = 'period' | 'category' | null;

/**
 * Recherche, puis une seule rangée de pastilles, d'après la maquette : période, dépenses, revenus, catégorie.
 *
 * La période et la catégorie ont trop de valeurs pour tenir dans la rangée ; leur pastille déplie un panneau dessous plutôt qu'une modale, qui masquerait la liste que le choix est en train de filtrer.
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
  const { categories } = useCategories(state.type);
  const [panel, setPanel] = useState<Panel>(null);

  const preset = presets.find((item) => item.id === state.presetId) ?? presets[0];
  const category = categories.find((item) => item.id === effectiveCategoryId);

  function toggleType(type: TransactionType) {
    const next = state.type === type ? null : type;
    onChange({
      ...state,
      type: next,
      // Une catégorie appartient à un seul type : passer à un type concret ne peut conserver une sélection que par coïncidence, donc on la vide. Repasser à « tout » élargit l'offre sans rien invalider.
      categoryId: next === null ? state.categoryId : null,
    });
  }

  return (
    <View style={styles.bar}>
      <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Rechercher une opération"
          placeholder="Rechercher une opération…"
          placeholderTextColor={colors.textMuted}
          value={state.search}
          onChangeText={(search) => onChange({ ...state, search })}
          returnKeyType="search"
          autoCorrect={false}
          style={[styles.searchInput, { color: colors.text }]}
        />
        {state.search !== '' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Effacer la recherche"
            hitSlop={spacing.sm}
            onPress={() => onChange({ ...state, search: '' })}
          >
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Défilement horizontal dans une liste verticale : l'avertissement de React Native ne vise que l'imbrication sur le même axe. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Chip
          label={preset.label}
          icon="calendar-month-outline"
          group="Période"
          // Toujours pleine : il y a toujours une période, et la maquette la présente comme le filtre de tête.
          selected
          expanded={panel === 'period'}
          onPress={() => setPanel(panel === 'period' ? null : 'period')}
        />
        <Chip
          label="Dépenses"
          group="Type"
          selected={state.type === 'expense'}
          onPress={() => toggleType('expense')}
        />
        <Chip
          label="Revenus"
          group="Type"
          selected={state.type === 'income'}
          onPress={() => toggleType('income')}
        />
        <Chip
          label={category?.name ?? 'Par catégorie'}
          trailingIcon={panel === 'category' ? 'chevron-up' : 'chevron-down'}
          group="Catégorie"
          selected={category !== undefined}
          expanded={panel === 'category'}
          onPress={() => setPanel(panel === 'category' ? null : 'category')}
        />
      </ScrollView>

      {panel === 'period' ? (
        <View style={styles.panel}>
          {presets.map((item) => (
            <Chip
              key={item.id}
              label={item.label}
              group="Période"
              selected={state.presetId === item.id}
              onPress={() => {
                onChange({ ...state, presetId: item.id });
                setPanel(null);
              }}
            />
          ))}
        </View>
      ) : null}

      {panel === 'category' ? (
        <View style={styles.panel}>
          <Chip
            label="Toutes"
            group="Catégorie"
            selected={effectiveCategoryId === null}
            onPress={() => {
              onChange({ ...state, categoryId: null });
              setPanel(null);
            }}
          />
          {categories.map((item) => (
            <Chip
              key={item.id}
              label={item.name}
              group="Catégorie"
              selected={effectiveCategoryId === item.id}
              onPress={() => {
                onChange({ ...state, categoryId: item.id });
                setPanel(null);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  group,
  selected,
  onPress,
  icon,
  trailingIcon,
  expanded,
}: {
  label: string;
  /** Nom du filtre, repris dans l'énoncé vocal : « Type : Dépenses ». */
  group: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  trailingIcon?: IconName;
  /** Pour une pastille qui déplie un panneau : annoncé au lecteur d'écran. */
  expanded?: boolean;
}) {
  const colors = useColors();
  // Sélectionnée, la pastille prend la couleur du texte, pas l'accent : l'accent désigne ce sur quoi on agit, et une rangée de pastilles vertes le banaliserait.
  const foreground = selected ? colors.background : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      // Sans le nom du filtre, un lecteur d'écran annoncerait des pastilles sans rien pour les distinguer.
      accessibilityLabel={`${group} : ${label}`}
      accessibilityState={{ selected, expanded }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.text : colors.surface,
          borderColor: selected ? colors.text : colors.border,
        },
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={16} color={foreground} /> : null}
      <Text style={[styles.chipLabel, { color: foreground }]}>{label}</Text>
      {trailingIcon ? (
        <MaterialCommunityIcons name={trailingIcon} size={16} color={foreground} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: spacing.sm + 2,
    paddingBottom: spacing.sm,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  searchInput: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 15,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  panel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md - 2,
  },
  chipLabel: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
});
