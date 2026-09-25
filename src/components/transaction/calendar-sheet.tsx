import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  firstDayOf,
  isSelectable,
  monthGrid,
  monthHasSelectable,
  monthOf,
  shiftMonth,
} from '@/lib/calendar';
import { dateToIso, formatMonthYear, isoToDate, todayIso } from '@/lib/dates';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const WEEKDAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// Hissé au niveau du module, comme les formateurs de src/lib/dates.ts : construire un Intl.DateTimeFormat coûte cher.
const headerFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const dayLabelFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type CalendarSheetProps = {
  visible: boolean;
  /** Date retenue, `YYYY-MM-DD`. */
  value: string;
  minimumDate?: Date;
  maximumDate?: Date;
  onSelect: (iso: string) => void;
  onClose: () => void;
};

/**
 * Calendrier aux couleurs de l'app, en feuille posée en bas de l'écran.
 *
 * Remplace la boîte de dialogue native d'Android, dont le bandeau et la sélection prennent la couleur du thème Android (bleu par défaut) et ne se règlent qu'au build natif — rien de visible sous Expo Go. Ici tout vient des tokens : vert, Carnet/Nocturne, Bricolage Grotesque, et la même feuille sur iOS et Android.
 *
 * Un appui sur un jour le retient et ferme la feuille, sans bouton « OK » : la saisie d'une dépense tient en trois taps, et une confirmation en ajouterait un. « Aujourd'hui » et « Hier » couvrent la plupart des corrections de date sans naviguer.
 */
export function CalendarSheet({
  visible,
  value,
  minimumDate,
  maximumDate,
  onSelect,
  onClose,
}: CalendarSheetProps) {
  const colors = useColors();
  const elevation = useElevation();
  const insets = useSafeAreaInsets();

  const min = minimumDate ? dateToIso(minimumDate) : undefined;
  const max = maximumDate ? dateToIso(maximumDate) : undefined;
  const today = todayIso();
  const yesterdayDate = isoToDate(today);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = dateToIso(yesterdayDate);

  // Mois affiché : celui de la date retenue à chaque ouverture, puis libre de naviguer.
  const [shown, setShown] = useState(() => monthOf(value));
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (visible && openedFor !== value) {
    // Ajusté pendant le rendu plutôt que dans un effet : la feuille s'ouvre directement sur le bon mois, sans une image intermédiaire sur l'ancien.
    setOpenedFor(value);
    setShown(monthOf(value));
  }
  if (!visible && openedFor !== null) {
    setOpenedFor(null);
  }

  const previous = shiftMonth(shown, -1);
  const next = shiftMonth(shown, 1);
  const canGoPrevious = monthHasSelectable(previous, min, max);
  const canGoNext = monthHasSelectable(next, min, max);

  const shortcuts = [
    { label: "Aujourd'hui", iso: today },
    { label: 'Hier', iso: yesterday },
  ].filter((shortcut) => isSelectable(shortcut.iso, min, max));

  function choose(iso: string) {
    onSelect(iso);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer le calendrier"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
        />

        <View
          style={[
            styles.sheet,
            elevation.floating,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Date retenue</Text>
            <Text style={[styles.selected, { color: colors.text }]}>
              {capitalize(headerFormatter.format(isoToDate(value)))}
            </Text>
          </View>

          <View style={styles.monthRow}>
            <NavButton
              icon="chevron-left"
              label="Mois précédent"
              enabled={canGoPrevious}
              onPress={() => setShown(previous)}
            />
            <Text style={[styles.monthTitle, { color: colors.text }]} accessibilityRole="header">
              {formatMonthYear(firstDayOf(shown))}
            </Text>
            <NavButton
              icon="chevron-right"
              label="Mois suivant"
              enabled={canGoNext}
              onPress={() => setShown(next)}
            />
          </View>

          <View style={styles.week}>
            {WEEKDAYS.map((day, index) => (
              <Text
                key={WEEKDAY_NAMES[index]}
                accessibilityLabel={WEEKDAY_NAMES[index]}
                style={[styles.weekday, { color: colors.textMuted }]}
              >
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {monthGrid(shown).map((week) => (
              <View key={week.find((day) => day !== null)} style={styles.week}>
                {week.map((day, index) => {
                  if (day === null) {
                    return <View key={`empty-${index}`} style={styles.cell} />;
                  }

                  const selected = day === value;
                  const isToday = day === today;
                  const enabled = isSelectable(day, min, max);

                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="button"
                      accessibilityLabel={`${dayLabelFormatter.format(isoToDate(day))}${isToday ? ", aujourd'hui" : ''}`}
                      accessibilityState={{ selected, disabled: !enabled }}
                      disabled={!enabled}
                      onPress={() => choose(day)}
                      style={styles.cell}
                    >
                      {({ pressed }) => (
                        <View
                          style={[
                            styles.day,
                            selected
                              ? { backgroundColor: colors.primary }
                              : pressed
                                ? { backgroundColor: colors.surfaceMuted }
                                : null,
                            // Aujourd'hui cerclé plutôt que rempli : distinct de la sélection, qui garde le seul aplat de couleur.
                            isToday && !selected ? { borderColor: colors.primary, borderWidth: 1.5 } : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayLabel,
                              {
                                color: selected
                                  ? colors.primaryText
                                  : enabled
                                    ? colors.text
                                    : colors.textMuted,
                                opacity: enabled ? 1 : 0.4,
                                fontFamily: selected || isToday ? font.bold : font.medium,
                              },
                            ]}
                          >
                            {Number(day.slice(8))}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.footer}>
            <View style={styles.shortcuts}>
              {shortcuts.map((shortcut) => {
                const active = shortcut.iso === value;
                return (
                  <Pressable
                    key={shortcut.iso}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => choose(shortcut.iso)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: active ? colors.primary : colors.surfaceMuted,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.chipLabel, { color: active ? colors.primaryText : colors.text }]}
                    >
                      {shortcut.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable accessibilityRole="button" hitSlop={spacing.sm} onPress={onClose}>
              <Text style={[styles.cancel, { color: colors.textMuted }]}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function NavButton({
  icon,
  label,
  enabled,
  onPress,
}: {
  icon: 'chevron-left' | 'chevron-right';
  label: string;
  enabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.nav,
        { backgroundColor: colors.surfaceMuted, opacity: enabled ? (pressed ? 0.7 : 1) : 0.35 },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
    // Sur tablette ou web large, la feuille garde une largeur de téléphone plutôt que d'étirer la grille.
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: radius.pill,
  },
  header: {
    gap: 2,
  },
  eyebrow: {
    fontFamily: font.semibold,
    fontSize: 14,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  selected: {
    fontFamily: font.black,
    fontSize: 28,
    letterSpacing: -0.6,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  monthTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.bold,
    fontSize: 18,
  },
  nav: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    gap: 2,
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.semibold,
    fontSize: 14,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  day: {
    // Largeur minimale plutôt que fixe : à grande échelle de police, le rond s'élargit avec son chiffre au lieu de le couper.
    minWidth: 40,
    height: 40,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: {
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  shortcuts: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  chipLabel: {
    fontFamily: font.semibold,
    fontSize: 16,
  },
  cancel: {
    fontFamily: font.semibold,
    fontSize: 17,
  },
});
