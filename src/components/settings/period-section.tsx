import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SettingsSection } from '@/components/settings/settings-section';
import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { periodStartDayLabel } from '@/lib/dates';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/** Bornes de la contrainte `check` en base : 29 à 31 n'existent pas tous les mois. */
const MIN_DAY = 1;
const MAX_DAY = 28;

/**
 * Jour de début de la période du groupe actif.
 *
 * Réglage du groupe et non de l'utilisateur : dans un budget partagé, les deux membres doivent parler de la même période. Seul le propriétaire le règle ; un simple membre voit la valeur.
 *
 * Pas d'enregistrement à chaque appui : chaque changement recalcule les bornes et recharge le tableau de bord, et dix appuis pour passer du 1er au 11 ne doivent pas déclencher dix rechargements.
 */
export function PeriodSection() {
  const colors = useColors();
  const { activeGroup } = useActiveGroup();
  const { updatePeriodStart, isUpdatingPeriod } = useGroupMutations();

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
        onSuccess: () => setDraft(null),
        onError: (error) => setSaveError(dataErrorMessage(error)),
      }
    );
  }

  return (
    <SettingsSection title={`Période budgétaire — ${activeGroup.name}`}>
      <Text style={[styles.sentence, { color: colors.text }]}>
        Chaque période commence {periodStartDayLabel(day)} du mois
        {day === 1 ? ' (mois calendaire)' : ''}.
      </Text>

      {isOwner ? (
        <>
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
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Utile pour caler la période sur le jour de paie. Les jours 29 à 31 n’existent pas tous
            les mois.
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
        </>
      ) : (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Réglé par le propriétaire du groupe.
        </Text>
      )}
    </SettingsSection>
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
  sentence: {
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 21,
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
  hint: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 17,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 13,
  },
});
