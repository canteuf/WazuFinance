import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SettingsSection } from '@/components/settings/settings-section';
import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { useThemePreference } from '@/hooks/use-theme-preference';
import { dataErrorMessage } from '@/lib/data-errors';
import { periodStartDayLabel } from '@/lib/dates';
import type { ThemePreference } from '@/lib/theme-preference';
import { font, radius, spacing, useColors } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Bornes de la contrainte `check` en base : 29 à 31 n'existent pas tous les mois. */
const MIN_DAY = 1;
const MAX_DAY = 28;

/** « Système » en tête : c'est le défaut, et le comportement de l'app avant que ce réglage n'existe. */
const THEMES: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'system', label: 'Système', icon: 'cellphone' },
  { value: 'light', label: 'Clair', icon: 'white-balance-sunny' },
  { value: 'dark', label: 'Sombre', icon: 'weather-night' },
];

export function PreferencesSection() {
  const colors = useColors();
  return (
    <SettingsSection title="Préférences d’usage">
      <ThemeBlock />
      <View style={[styles.separator, { backgroundColor: colors.border }]} />
      <CycleBlock />
    </SettingsSection>
  );
}

function BlockTitle({ icon, title }: { icon: IconName; title: string }) {
  const colors = useColors();
  return (
    <View style={styles.blockTitle}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.primary} />
      <Text style={[styles.blockTitleText, { color: colors.text }]}>{title}</Text>
    </View>
  );
}

function ThemeBlock() {
  const colors = useColors();
  const { preference, choose } = useThemePreference();

  return (
    <View style={styles.block}>
      <BlockTitle icon="palette-outline" title="Thème d’affichage" />
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        « Système » suit le réglage du téléphone, de jour comme de nuit.
      </Text>
      <View
        accessibilityRole="radiogroup"
        style={[styles.segmented, { backgroundColor: colors.surfaceMuted }]}
      >
        {THEMES.map((theme) => {
          const selected = theme.value === preference;
          return (
            <Pressable
              key={theme.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Thème ${theme.label}`}
              onPress={() => choose(theme.value)}
              style={[styles.segment, selected && { backgroundColor: colors.surface }]}
            >
              <MaterialCommunityIcons
                name={theme.icon}
                size={16}
                color={selected ? colors.text : colors.textMuted}
              />
              <Text
                style={[
                  styles.segmentLabel,
                  { color: selected ? colors.text : colors.textMuted },
                ]}
              >
                {theme.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Jour de début de la période du groupe actif.
 *
 * Réglage du groupe et non de l'utilisateur : dans un budget partagé, les deux membres doivent parler de la même période. Seul le propriétaire le règle ; un simple membre voit la valeur.
 *
 * Pas d'enregistrement à chaque appui : chaque changement recalcule les bornes et recharge le tableau de bord, et dix appuis pour passer du 1er au 11 ne doivent pas déclencher dix rechargements.
 */
function CycleBlock() {
  const colors = useColors();
  const { activeGroup } = useActiveGroup();
  const { updatePeriodStart, isUpdatingPeriod } = useGroupMutations();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string>();

  if (!activeGroup) {
    return null;
  }

  const current = activeGroup.periodStartDay;
  const day = draft ?? current;
  const isOwner = activeGroup.role === 'owner';

  function step(delta: number) {
    setSaveError(undefined);
    setDraft(Math.min(Math.max(day + delta, MIN_DAY), MAX_DAY));
  }

  function handleSave() {
    if (!activeGroup) {
      return;
    }
    setSaveError(undefined);
    updatePeriodStart.mutate(
      { groupId: activeGroup.groupId, day },
      {
        onSuccess: () => {
          setDraft(null);
          setOpen(false);
        },
        onError: (error) => setSaveError(dataErrorMessage(error)),
      }
    );
  }

  const pillLabel = `${periodStartDayLabel(current).replace(/^le /, 'Le ')} du mois`;

  return (
    <View style={styles.block}>
      <View style={styles.cycleHead}>
        <BlockTitle icon="calendar-sync-outline" title="Cycle mensuel" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Jour de début de période : ${pillLabel}${isOwner ? '. Modifier' : ''}`}
          // Un simple membre voit la valeur sans pouvoir l'ouvrir : la policy budget_groups_update_owner refuserait de toute façon.
          disabled={!isOwner}
          onPress={() => {
            setDraft(null);
            setSaveError(undefined);
            setOpen((value) => !value);
          }}
          style={[styles.pill, { backgroundColor: colors.surfaceMuted }]}
        >
          <Text style={[styles.pillLabel, { color: colors.text }]}>{pillLabel}</Text>
          {isOwner ? (
            <MaterialCommunityIcons name="unfold-more-horizontal" size={16} color={colors.text} />
          ) : null}
        </Pressable>
      </View>

      <Text style={[styles.hint, { color: colors.textMuted }]}>
        Définit le jour de remise à zéro de vos enveloppes et jauges de dépenses
        {activeGroup.isPersonal ? '' : ` pour « ${activeGroup.name} »`}.
        {isOwner ? '' : ' Réglé par le propriétaire du groupe.'}
      </Text>

      {open && isOwner ? (
        <View style={styles.editor}>
          <View style={styles.stepper}>
            <StepButton
              icon="minus"
              label="Reculer d’un jour"
              disabled={day <= MIN_DAY}
              onPress={() => step(-1)}
            />
            <Text style={[styles.day, { color: colors.text }]}>{day}</Text>
            <StepButton
              icon="plus"
              label="Avancer d’un jour"
              disabled={day >= MAX_DAY}
              onPress={() => step(1)}
            />
          </View>
          <Text style={[styles.hint, styles.centered, { color: colors.textMuted }]}>
            Utile pour caler la période sur le jour de paie. Les jours 29 à 31 n’existent pas
            tous les mois.
          </Text>
          {saveError ? (
            <Text style={[styles.error, { color: colors.danger }]}>{saveError}</Text>
          ) : null}
          <Button
            title="Enregistrer"
            loading={isUpdatingPeriod}
            disabled={day === current}
            onPress={handleSave}
          />
        </View>
      ) : null}
    </View>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'minus' | 'plus';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      // Désactivé aux bornes : aucune valeur hors de 1 à 28 ne peut être composée, la contrainte en base n'a jamais à refuser.
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.stepButton,
        { backgroundColor: colors.surfaceMuted, opacity: disabled ? 0.4 : 1 },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm + 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth * 2,
  },
  blockTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  blockTitleText: {
    fontFamily: font.bold,
    fontSize: 19,
    letterSpacing: -0.2,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 21,
  },
  centered: {
    textAlign: 'center',
  },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.md,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    borderRadius: radius.sm + 2,
  },
  segmentLabel: {
    fontFamily: font.semibold,
    fontSize: 16,
  },
  cycleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // À fort grossissement de police, la pastille passe sous le titre plutôt que de l'écraser.
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md - 2,
    minHeight: 40,
    borderRadius: radius.sm + 2,
  },
  pillLabel: {
    fontFamily: font.semibold,
    fontSize: 16,
  },
  editor: {
    gap: spacing.sm + 2,
    paddingTop: spacing.xs,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.lg,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    fontFamily: font.black,
    fontSize: 28,
    minWidth: 48,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  error: {
    fontFamily: font.medium,
    fontSize: 15,
  },
});
