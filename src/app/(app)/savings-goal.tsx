import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  SavingsGoalForm,
  type SavingsGoalFormValues,
} from '@/components/savings/savings-goal-form';
import { AmountAdjuster } from '@/components/ui/amount-adjuster';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { CONTENT_GUTTER, contentColumn } from '@/components/ui/screen';
import { SheetScrollView } from '@/components/ui/sheet-scroll-view';
import { WalletPicker } from '@/components/wallet/wallet-picker';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import { useRequestIds } from '@/hooks/use-request-ids';
import { useWalletChoice } from '@/hooks/use-wallet-choice';
import { useSavingsGoalMutations } from '@/hooks/use-savings-goal-mutations';
import { useSavingsGoals } from '@/hooks/use-savings-goals';
import { useSheetMaxHeight } from '@/hooks/use-sheet-max-height';
import { dataErrorMessage } from '@/lib/data-errors';
import { writeLastWallet } from '@/lib/last-used';
import { formatMoney } from '@/lib/money';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';
import { goBackOr } from '@/lib/navigation';

/**
 * Une seule route pour les deux modes : création sans paramètre, édition avec ?id=. Même parti que budget.tsx et transaction.tsx.
 *
 * En édition, l'écran s'ouvre sur le versement : c'est ce qu'on vient faire neuf fois sur dix. Le montant épargné ne se réécrit pas, il s'augmente ou se diminue — add_to_savings_goal() fait l'addition en base, sans perdre un versement fait entre-temps depuis un autre appareil. Nom, icône, cible et échéance se modifient en dessous.
 */
export default function SavingsGoalScreen() {
  const colors = useColors();
  const elevation = useElevation();
  const router = useRouter();
  const sheetMaxHeight = useSheetMaxHeight();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { goals, isLoading, error } = useSavingsGoals();
  const { createGoal, updateGoal, addToGoal, deleteGoal, isSaving, isDeleting } =
    useSavingsGoalMutations();
  const [errorText, setErrorText] = useState<string>();
  const [adjustError, setAdjustError] = useState<string>();
  // Un identifiant par montant : retoucher « Verser » après « Pas de connexion » ne verse pas deux fois si le premier envoi était passé.
  const requestIdFor = useRequestIds();
  // Les versements passent par le compte personnel, quel que soit le groupe affiché : ce sont ses portefeuilles qui se proposent.
  const { groups } = useActiveGroup();
  const personalGroupId = groups.find((group) => group.isPersonal)?.groupId ?? null;
  const wallet = useWalletChoice(personalGroupId);

  const existing = typeof id === 'string' ? goals.find((goal) => goal.id === id) : undefined;

  // Tous les hooks ci-dessus s'exécutent à chaque rendu ; les retours conditionnels qui suivent n'en court-circuitent aucun.
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // En pratique toujours vrai ici : les routes (app) ne sont atteignables qu'avec une session (garde Stack.Protected du layout racine). Ce garde évite une assertion non sûre plutôt que de documenter un cas impossible.
  if (error || !userId) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          {error ? dataErrorMessage(error) : 'Session introuvable.'}
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => goBackOr(router, '/savings-goals')} />
      </View>
    );
  }

  // L'objectif visé n'est plus dans la liste : supprimé pendant que la feuille était ouverte (un autre appareil du même compte), ou identifiant périmé. Sans ce garde, le formulaire s'ouvrirait vide sous « Modifier ».
  if (typeof id === 'string' && !existing) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          Cet objectif n’existe plus.
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => goBackOr(router, '/savings-goals')} />
      </View>
    );
  }

  function handleSubmit(values: SavingsGoalFormValues) {
    setErrorText(undefined);

    if (existing) {
      // Sans le montant épargné : modifier l'objectif ne le réécrit jamais (voir UpdateSavingsGoalInput).
      updateGoal.mutate(
        {
          id: existing.id,
          patch: {
            name: values.name,
            icon: values.icon,
            targetAmount: values.targetAmount,
            targetDate: values.targetDate,
          },
        },
        {
          onSuccess: () => goBackOr(router, '/savings-goals'),
          onError: (mutationError) => setErrorText(dataErrorMessage(mutationError)),
        }
      );
      return;
    }

    createGoal.mutate(
      {
        userId: userId as string,
        name: values.name,
        icon: values.icon,
        targetAmount: values.targetAmount,
        currentAmount: values.initialAmount,
        targetDate: values.targetDate,
      },
      {
        onSuccess: () => goBackOr(router, '/savings-goals'),
        onError: (mutationError) => setErrorText(dataErrorMessage(mutationError)),
      }
    );
  }

  function handleAdjust(delta: number) {
    if (!existing) {
      return;
    }
    setAdjustError(undefined);
    addToGoal.mutate(
      { id: existing.id, delta, requestId: requestIdFor(String(delta)), walletId: wallet.walletId },
      {
        onSuccess: () => {
          if (personalGroupId && wallet.walletId) {
            void writeLastWallet(personalGroupId, wallet.walletId);
          }
          goBackOr(router, '/savings-goals');
        },
        onError: (mutationError) => setAdjustError(dataErrorMessage(mutationError)),
      }
    );
  }

  function handleDelete() {
    if (!existing) {
      return;
    }
    deleteGoal.mutate(existing.id, {
      onSuccess: () => goBackOr(router, '/savings-goals'),
      onError: (mutationError) => setErrorText(dataErrorMessage(mutationError)),
    });
  }

  return (
    <View
      style={[
        styles.sheet,
        { backgroundColor: colors.background, maxHeight: sheetMaxHeight },
      ]}
    >
      {/* Une formSheet n'accepte pas de header natif : le titre et la fermeture sont du contenu ordinaire, comme sur la saisie. */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          hitSlop={spacing.sm}
          onPress={() => goBackOr(router, '/savings-goals')}
          style={styles.close}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
          <Text style={[styles.closeLabel, { color: colors.text }]}>Fermer</Text>
        </Pressable>
      </View>

      <View style={styles.titleBlock}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Objectif d’épargne</Text>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {existing ? existing.name : 'Nouvel objectif'}
        </Text>
      </View>

      <SheetScrollView
        // La feuille centre ses blocs (`alignItems: 'center'`) : sans cette largeur explicite, le ScrollView se réduirait à la largeur de son contenu, que son propre conteneur exprime en pourcentage de lui — une mesure qui ne converge pas.
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // Même raison que sur la saisie d’une écriture : sans défilement imbriqué, la feuille Android capte le glissement vers le bas et le haut du formulaire devient inaccessible.
        nestedScrollEnabled
      >
        {existing ? (
          <>
            <View style={[styles.status, { backgroundColor: colors.surface }, elevation.card]}>
              <View style={styles.statusRow}>
                <Text style={[styles.statusCurrent, { color: colors.text }]}>
                  {formatMoney(existing.current_amount)}
                </Text>
                <Text style={[styles.statusTarget, { color: colors.textMuted }]}>
                  / {formatMoney(existing.target_amount)}
                </Text>
              </View>
              <ProgressBar
                ratio={existing.current_amount / existing.target_amount}
                tone={existing.current_amount >= existing.target_amount ? 'muted' : 'accent'}
                size="lg"
              />
            </View>

            {wallet.showPicker ? (
              <View style={styles.walletField}>
                <Text style={[styles.walletLabel, { color: colors.textMuted }]}>
                  Portefeuille du compte personnel
                </Text>
                <WalletPicker
                  wallets={wallet.wallets}
                  selectedId={wallet.selectedId}
                  onSelect={wallet.select}
                />
              </View>
            ) : null}

            <AmountAdjuster
              options={{
                add: { label: 'Verser', icon: 'plus-circle-outline' },
                remove: { label: 'Retirer', icon: 'minus-circle-outline' },
              }}
              current={existing.current_amount}
              minimumAfter={0}
              amountLabel={(mode) => (mode === 'add' ? 'Montant à verser' : 'Montant à retirer')}
              previewLabel="Nouveau total épargné"
              previewDetail={(next) =>
                next >= existing.target_amount
                  ? 'Objectif atteint'
                  : `sur ${formatMoney(existing.target_amount)} ·${Math.round((next / existing.target_amount) * 100)} %`
              }
              submitLabel={(mode) =>
                mode === 'add' ? 'Enregistrer le versement' : 'Enregistrer le retrait'
              }
              tooLowMessage="Le retrait dépasse le montant épargné."
              submitting={addToGoal.isPending}
              errorText={adjustError}
              onSubmit={handleAdjust}
            />
            {/* Dit avant d'enregistrer ce que le versement fait au solde : sans cette phrase, voir le solde du compte personnel baisser après un versement ressemblerait à une erreur. */}
            <Text style={[styles.adjustHint, { color: colors.textMuted }]}>
              Un versement sort du solde de votre compte personnel, un retrait y revient
              {wallet.showPicker ? ', dans le portefeuille choisi' : ''}.
            </Text>

            <Text style={[styles.section, { color: colors.text }]}>Paramètres de l’objectif</Text>
          </>
        ) : null}

        <SavingsGoalForm
          initialValues={
            existing
              ? {
                  name: existing.name,
                  icon: existing.icon,
                  targetAmount: existing.target_amount,
                  targetDate: existing.target_date,
                }
              : undefined
          }
          submitLabel={existing ? 'Enregistrer les modifications' : 'Créer l’objectif'}
          submitting={isSaving}
          deleting={isDeleting}
          errorText={errorText}
          onSubmit={handleSubmit}
          onDelete={existing ? handleDelete : undefined}
        />
      </SheetScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  walletField: {
    gap: spacing.sm,
  },
  walletLabel: {
    fontFamily: font.semibold,
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sheet: {
    // Le fond garde la pleine largeur de la feuille ; ce sont les blocs qui se centrent, sur la même colonne que les écrans (voir `contentColumn`). Sans cela, le contenu d'une feuille s'étalait d'un bord à l'autre sur une tablette là où les cartes des écrans s'arrêtent à 420 points.
    alignItems: 'center',
  },
  header: {
    ...contentColumn,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingHorizontal: CONTENT_GUTTER,
  },
  close: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  closeLabel: {
    fontFamily: font.semibold,
    fontSize: 18,
  },
  titleBlock: {
    ...contentColumn,
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
    paddingHorizontal: CONTENT_GUTTER,
  },
  eyebrow: {
    fontFamily: font.semibold,
    fontSize: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: font.black,
    fontSize: 28,
    letterSpacing: -0.7,
    textAlign: 'center',
  },
  scroll: {
    alignSelf: 'stretch',
  },
  scrollContent: {
    ...contentColumn,
    flexGrow: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  status: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  statusCurrent: {
    fontFamily: font.bold,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
  },
  statusTarget: {
    fontFamily: font.regular,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
  adjustHint: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 21,
  },
  section: {
    fontFamily: font.bold,
    fontSize: 15,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  errorTitle: {
    fontFamily: font.medium,
    fontSize: 16,
    textAlign: 'center',
  },
});
