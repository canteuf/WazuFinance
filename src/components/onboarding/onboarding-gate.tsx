import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { useIsOnline } from '@/hooks/use-offline-status';
import { useWalletMutations } from '@/hooks/use-wallet-mutations';
import { authErrorMessage } from '@/lib/auth-errors';
import { dataErrorMessage } from '@/lib/data-errors';
import { hasAcceptedCurrentTerms } from '@/lib/legal';
import { isOnboardingPending, SUGGESTED_WALLETS, USAGES, type Usage } from '@/lib/onboarding';
import { font, radius, spacing, useColors } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const STEPS = 3;
const DAYS = Array.from({ length: 28 }, (_, index) => index + 1);

const DAYS_PER_ROW = 7;
const DAY_GAP = spacing.sm;
/** Cible tactile minimale : en dessous, les ronds gardent cette taille et passent à la ligne plutôt que de rétrécir. */
const DAY_MIN = 44;
/** Au-delà, un rond grossi n'apporte rien et pousse « Continuer » vers le bas sur une tablette. */
const DAY_MAX = 56;

/**
 * Taille des ronds des jours pour une grille de `width` points : sept par rangée, de bord à bord.
 *
 * À 48 points fixes, sept ronds laissaient un vide à droite de la grille sur un téléphone ordinaire. Avant la première mesure (`width` à 0), et sur un écran trop étroit pour sept ronds de 44 points, la grille revient aux ronds de 48 qui passent à la ligne.
 */
function daySize(width: number): { size: number; wrap: boolean } {
  const fitted = Math.floor((width - DAY_GAP * (DAYS_PER_ROW - 1)) / DAYS_PER_ROW);
  if (width === 0 || fitted < DAY_MIN) {
    return { size: 48, wrap: true };
  }
  return { size: Math.min(fitted, DAY_MAX), wrap: false };
}

/**
 * Accueil d'un nouveau compte, en trois écrans : l'usage, le jour de paie, les portefeuilles mobile money. Chacun se passe d'un toucher ; à la fin, la première saisie s'ouvre.
 *
 * Un compte neuf arrivait sur une Synthèse à zéro sans savoir par où commencer, et le jour de paie, qui décide de toutes les périodes, dormait dans les Paramètres. Seuls les comptes créés par cette version le voient (`isOnboardingPending`).
 *
 * Un `Modal` RN, comme `TermsGate` et pour la même raison ; il attend que les CGU soient acceptées, et, comme lui, n'apparaît qu'en ligne : tout ce qu'il enregistre part aussitôt vers la base.
 */
export function OnboardingGate() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, completeOnboarding } = useAuth();
  const online = useIsOnline();
  const { groups } = useActiveGroup();
  const { updatePeriodStart } = useGroupMutations();
  const { create: createWallet } = useWalletMutations();

  const personal = groups.find((group) => group.isPersonal) ?? null;
  const metadata = session?.user.user_metadata;
  const visible =
    session !== null &&
    online &&
    personal !== null &&
    hasAcceptedCurrentTerms(metadata) &&
    isOnboardingPending(metadata);

  const [step, setStep] = useState(0);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [payday, setPayday] = useState<number | null>(null);
  const [wallets, setWallets] = useState<string[]>([]);
  // Un identifiant par portefeuille, tiré une fois : un deuxième toucher sur « Terminer » après une erreur réseau retrouve les portefeuilles déjà créés au lieu d'en doubler.
  const [walletIds] = useState(() => Object.fromEntries(SUGGESTED_WALLETS.map(({ name }) => [name, randomUUID()])));
  // Largeur de la grille des jours, mesurée : la taille des ronds en découle (voir `daySize()`).
  const [daysWidth, setDaysWidth] = useState(0);
  const dayLayout = daySize(daysWidth);
  const [created, setCreated] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  function toggleWallet(name: string) {
    setWallets((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  }

  async function finish(chosenWallets: string[]) {
    if (!personal) {
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      if (payday !== null && payday !== personal.periodStartDay) {
        await updatePeriodStart.mutateAsync({ groupId: personal.groupId, day: payday });
      }
      for (const name of chosenWallets) {
        const suggestion = SUGGESTED_WALLETS.find((item) => item.name === name);
        if (!suggestion || created.includes(name)) {
          continue;
        }
        try {
          await createWallet.mutateAsync({
            id: walletIds[name],
            groupId: personal.groupId,
            name,
            kind: suggestion.kind,
            openingBalance: 0,
          });
        } catch (caught) {
          // Même identifiant déjà en base : le premier envoi est passé, seule sa réponse s'est perdue.
          if (!(typeof caught === 'object' && caught !== null && (caught as { code?: unknown }).code === '23505')) {
            throw caught;
          }
        }
        setCreated((current) => [...current, name]);
      }
    } catch (caught) {
      setSaving(false);
      setError(dataErrorMessage(caught));
      return;
    }
    try {
      await completeOnboarding(usage);
    } catch (caught) {
      setSaving(false);
      setError(authErrorMessage(caught));
      return;
    }
    setSaving(false);
    // La première saisie, tout de suite : c'est elle qui fait revenir le lendemain.
    router.push('/transaction');
  }

  function next() {
    if (step < STEPS - 1) {
      setStep(step + 1);
    } else {
      void finish(wallets);
    }
  }

  function skip() {
    if (step === 0) {
      setUsage(null);
    } else if (step === 1) {
      setPayday(null);
    }
    if (step < STEPS - 1) {
      setStep(step + 1);
    } else {
      void finish([]);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      // Retour Android : on passe les étapes par « Passer », l'accueil ne se ferme pas par erreur.
      onRequestClose={() => undefined}
    >
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <Text style={[styles.progress, { color: colors.textMuted }]}>
          Étape {step + 1} sur {STEPS}
        </Text>

        {step === 0 ? (
          <>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              Pour quoi utiliserez-vous Wazu ?
            </Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Tout reste disponible quel que soit votre choix : il sert à vous proposer ce qui vous sera le plus utile.
            </Text>
            <View style={styles.options} accessibilityRole="radiogroup">
              {USAGES.map((item) => (
                <Choice
                  key={item.id}
                  icon={item.icon as IconName}
                  label={item.label}
                  hint={item.hint}
                  selected={usage === item.id}
                  role="radio"
                  onPress={() => setUsage(item.id)}
                />
              ))}
            </View>
          </>
        ) : step === 1 ? (
          <>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              Quel jour recevez-vous votre argent ?
            </Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Votre salaire, votre paie ou vos principales rentrées. Votre mois budgétaire commencera ce jour-là. Vous pourrez le changer dans les Paramètres.
            </Text>
            <View
              style={[styles.days, dayLayout.wrap ? null : styles.daysFilled]}
              accessibilityRole="radiogroup"
              onLayout={(event) => setDaysWidth(event.nativeEvent.layout.width)}
            >
              {DAYS.map((day) => {
                const selected = (payday ?? personal?.periodStartDay ?? 1) === day;
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={day === 1 ? 'Le 1er du mois' : `Le ${day} du mois`}
                    onPress={() => setPayday(day)}
                    style={[
                      styles.day,
                      {
                        width: dayLayout.size,
                        height: dayLayout.size,
                        borderRadius: dayLayout.size / 2,
                        backgroundColor: selected ? colors.primary : colors.surface,
                        borderColor: selected ? colors.primary : colors.inputBorder,
                      },
                    ]}
                  >
                    <Text style={[styles.dayLabel, { color: selected ? colors.primaryText : colors.text }]}>
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              Où gardez-vous votre argent ?
            </Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Cochez ce que vous utilisez : chacun aura son solde, à côté de « Principal » pour vos espèces. Vous pourrez en ajouter d’autres plus tard.
            </Text>
            <View style={styles.options}>
              {SUGGESTED_WALLETS.map(({ name, icon }) => (
                <Choice
                  key={name}
                  icon={icon as IconName}
                  label={name}
                  selected={wallets.includes(name)}
                  role="checkbox"
                  onPress={() => toggleWallet(name)}
                />
              ))}
            </View>
          </>
        )}

        {error ? (
          <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            title={step < STEPS - 1 ? 'Continuer' : 'Terminer'}
            loading={saving}
            onPress={next}
          />
          <Button title="Passer" variant="ghost" disabled={saving} onPress={skip} />
        </View>
      </ScrollView>
    </Modal>
  );
}

function Choice({
  icon,
  label,
  hint,
  selected,
  role,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  selected: boolean;
  role: 'radio' | 'checkbox';
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      onPress={onPress}
      style={[
        styles.choice,
        {
          backgroundColor: colors.surface,
          borderColor: selected ? colors.primary : colors.inputBorder,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth * 2,
        },
      ]}
    >
      <View style={[styles.glyph, { backgroundColor: colors.surfaceMuted }]}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.choiceText}>
        <Text style={[styles.choiceLabel, { color: colors.text }]}>{label}</Text>
        {hint ? <Text style={[styles.choiceHint, { color: colors.textMuted }]}>{hint}</Text> : null}
      </View>
      <MaterialCommunityIcons
        name={
          role === 'radio'
            ? selected
              ? 'radiobox-marked'
              : 'radiobox-blank'
            : selected
              ? 'checkbox-marked'
              : 'checkbox-blank-outline'
        }
        size={24}
        color={selected ? colors.primary : colors.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  progress: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
  title: {
    fontFamily: font.black,
    fontSize: 26,
    letterSpacing: -0.5,
  },
  body: {
    fontFamily: font.regular,
    fontSize: 17,
    lineHeight: 24,
  },
  options: {
    gap: spacing.sm,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 56,
  },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: {
    flex: 1,
    gap: 2,
  },
  choiceLabel: {
    fontFamily: font.semibold,
    fontSize: 17,
  },
  choiceHint: {
    fontFamily: font.regular,
    fontSize: 15,
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: DAY_GAP,
  },
  // Sept ronds par rangée : le reste d'arrondi (moins d'un point par rond) se répartit dans les intervalles au lieu de s'accumuler à droite. Les 28 jours font quatre rangées pleines, donc aucune rangée incomplète ne s'étire.
  daysFilled: {
    justifyContent: 'space-between',
  },
  day: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: {
    fontFamily: font.semibold,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
  error: {
    fontFamily: font.medium,
    fontSize: 16,
  },
  actions: {
    gap: spacing.sm,
    marginTop: 'auto',
    paddingTop: spacing.md,
  },
});
