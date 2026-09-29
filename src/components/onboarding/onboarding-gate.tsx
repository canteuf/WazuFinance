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
  const [walletIds] = useState(() => Object.fromEntries(SUGGESTED_WALLETS.map((name) => [name, randomUUID()])));
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
        if (created.includes(name)) {
          continue;
        }
        try {
          await createWallet.mutateAsync({
            id: walletIds[name],
            groupId: personal.groupId,
            name,
            kind: 'mobile_money',
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
            <View style={styles.days} accessibilityRole="radiogroup">
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
              Utilisez-vous le mobile money ?
            </Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Cochez ceux que vous utilisez : chacun aura son solde, à côté de « Principal » pour vos espèces. Vous pourrez en ajouter d’autres, ou votre banque, plus tard.
            </Text>
            <View style={styles.options}>
              {SUGGESTED_WALLETS.map((name) => (
                <Choice
                  key={name}
                  icon="cellphone"
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
    gap: spacing.sm,
  },
  day: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
