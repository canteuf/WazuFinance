import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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

type PanelId = 'period' | 'category' | null;

/**
 * Recherche, puis les pastilles de filtre, d'après la maquette : période, dépenses, revenus, catégorie.
 *
 * La maquette les tient sur une seule rangée ; à la largeur réelle d'un téléphone elles n'y tiennent pas, et le défilement horizontal coupait la dernière en deux au bord de l'écran. Elles passent donc à la ligne : deux rangées pleines valent mieux qu'une rangée tronquée.
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
  const [panel, setPanel] = useState<PanelId>(null);

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

      {/* Les quatre pastilles passent à la ligne plutôt que de défiler horizontalement : à la largeur d'un téléphone, la dernière (« Par catégorie ») était coupée au bord de l'écran, ce qui se lit comme un défaut d'affichage et non comme une invitation à faire défiler. */}
      <View style={styles.row}>
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
      </View>

      {panel === 'period' ? (
        <Panel title="Période">
          {presets.map((item) => (
            <Chip
              key={item.id}
              label={item.label}
              group="Période"
              block
              selected={state.presetId === item.id}
              onPress={() => {
                onChange({ ...state, presetId: item.id });
                setPanel(null);
              }}
            />
          ))}
        </Panel>
      ) : null}

      {panel === 'category' ? (
        <Panel title="Catégorie">
          <Chip
            label="Toutes"
            group="Catégorie"
            block
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
              block
              selected={effectiveCategoryId === item.id}
              onPress={() => {
                onChange({ ...state, categoryId: item.id });
                setPanel(null);
              }}
            />
          ))}
        </Panel>
      ) : null}
    </View>
  );
}

/**
 * Le dépliant d'un filtre : un intertitre, puis ses valeurs en grille de deux colonnes égales, sur une surface qui le détache de la liste qu'il filtre.
 *
 * Les valeurs s'alignaient jusqu'ici au fil du texte, chacune à la largeur de son libellé : quatorze catégories produisaient sept lignes de longueurs différentes, sans colonne à suivre du regard. La grille les range, au prix d'un peu de place perdue sur les libellés courts.
 */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();

  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.panelTitle, { color: colors.textMuted }]}>{title}</Text>
      <View style={styles.grid}>{children}</View>
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
  block = false,
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
  /** Dans un panneau : la pastille occupe une colonne entière de la grille, au lieu de s'ajuster à son libellé. */
  block?: boolean;
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
        block ? styles.chipBlock : null,
        {
          backgroundColor: selected ? colors.text : colors.surface,
          borderColor: selected ? colors.text : colors.border,
        },
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={16} color={foreground} /> : null}
      {/* Tronqué plutôt que replié : en grille, un libellé sur deux lignes ferait une pastille plus haute que ses voisines et romprait l'alignement des rangées. */}
      <Text style={[styles.chipLabel, { color: foreground }]} numberOfLines={1}>
        {label}
      </Text>
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
    fontSize: 17,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  panel: {
    gap: spacing.sm + 2,
    padding: spacing.md - 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  panelTitle: {
    fontFamily: font.semibold,
    fontSize: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // Même hauteur pour toutes, libellé long ou court : c'est ce qui fait tenir les rangées de la grille.
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md - 2,
  },
  chipBlock: {
    // Deux colonnes exactement : à 48 % chacune, une troisième ne tient jamais sur la ligne, et la dernière rangée garde la largeur d'une colonne au lieu de s'étirer sur toute la largeur.
    flexBasis: '48%',
  },
  chipLabel: {
    fontFamily: font.semibold,
    fontSize: 16,
    flexShrink: 1,
  },
});
