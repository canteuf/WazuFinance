import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { randomUUID } from 'expo-crypto';
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
  TransactionForm,
  type TransactionFormValues,
} from '@/components/transaction/transaction-form';
import { Button } from '@/components/ui/button';
import { CONTENT_GUTTER, contentColumn } from '@/components/ui/screen';
import { SheetScrollView } from '@/components/ui/sheet-scroll-view';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import { useIsOnline } from '@/hooks/use-offline-status';
import { useRecurringMutations } from '@/hooks/use-recurring-mutations';
import { useSheetMaxHeight } from '@/hooks/use-sheet-max-height';
import { useTransaction } from '@/hooks/use-transaction';
import { useToast } from '@/hooks/use-toast';
import { useTransactionMutations } from '@/hooks/use-transaction-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { formatMoney } from '@/lib/money';
import { anchorFor, describeRecurrence, nextDueAfter } from '@/lib/recurrence';
import { font, spacing, useColors } from '@/theme/tokens';
import { goBackOr } from '@/lib/navigation';

/**
 * Une seule route pour les deux modes : création sans paramètre, édition avec ?id=. Le formulaire est ainsi écrit et corrigé une seule fois.
 */
export default function TransactionScreen() {
  const colors = useColors();
  const router = useRouter();
  const sheetMaxHeight = useSheetMaxHeight();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const {
    activeGroupId,
    activeGroup,
    isLoading: groupLoading,
    error: groupError,
  } = useActiveGroup();
  const { createTransaction, updateTransaction, deleteTransaction, isSaving, isDeleting } =
    useTransactionMutations();
  const online = useIsOnline();
  const toast = useToast();
  const recurringMutations = useRecurringMutations();
  const [errorText, setErrorText] = useState<string>();
  // Tiré une fois pour toute la vie de la feuille : un second « Enregistrer » après un échec réseau renvoie la même saisie, que la base reconnaît au lieu de la créer deux fois (voir `create` dans src/data/transactions.ts).
  const [newId] = useState(randomUUID);

  const existing = useTransaction(id);

  const userId = session?.user.id;

  // Tous les hooks ci-dessus s'exécutent à chaque rendu ; les retours conditionnels qui suivent n'en court-circuitent aucun.
  if (groupLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Sans cette branche, un chargement des adhésions en échec (ou l'absence de groupe actif) tombait sur une feuille fitToContents vide : ni contenu, ni message, ni sortie. Le bouton Retour reste la seule issue fiable, la poignée de la feuille ne l'étant pas sur toutes les plateformes.
  if (groupError || !activeGroupId || !userId) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          {groupError ? dataErrorMessage(groupError) : 'Aucun groupe actif.'}
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => goBackOr(router, '/')} />
      </View>
    );
  }

  if (typeof id === 'string' && existing.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // React Query v5 laisse isLoading à false une fois l'échec établi : sans ce garde, un fetch en échec (réseau, ligne supprimée, accès révoqué) laisse passer un formulaire vide sous le titre « Modifier », et l'enregistrer écraserait la vraie transaction avec des valeurs ressaisies de zéro.
  if (typeof id === 'string' && existing.isError) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          {dataErrorMessage(existing.error)}
        </Text>
        <Button title="Retour" variant="ghost" onPress={() => goBackOr(router, '/')} />
      </View>
    );
  }

  /** Ferme la feuille sur un message qui dit ce qui vient d'être enregistré : la feuille disparue, rien d'autre ne le confirmerait. */
  function succeed(message: string) {
    toast.show(message);
    goBackOr(router, '/');
  }

  const onError = (error: Error) => setErrorText(dataErrorMessage(error));

  // Hors ligne, l'opération se met en file et ne réussira qu'au retour du réseau : attendre ce succès laisserait la feuille ouverte sur un bouton qui tourne. Elle se ferme donc aussitôt, sur un message qui le dit, et le bandeau d'état compte l'opération en attente ; un refus ultérieur de la base s'affiche en alerte (query-provider), puisque la feuille ne sera plus là pour le montrer.
  function closeIfQueued() {
    if (!online) {
      toast.show('Enregistrée sur le téléphone. Envoi au retour du réseau.', 'info');
      goBackOr(router, '/');
    }
  }

  function handleSubmit(values: TransactionFormValues) {
    setErrorText(undefined);
    const what = `${values.type === 'expense' ? 'Dépense' : 'Revenu'} de ${formatMoney(values.amount)}`;

    if (typeof id === 'string') {
      // `repeat` n'a pas de sens en modification, et ne doit pas partir dans les variables de la mutation, qui sont gardées sur le disque hors ligne.
      const { repeat: _repeat, ...patch } = values;
      updateTransaction.mutate(
        { id, patch },
        { onSuccess: () => succeed(`${what} modifié${values.type === 'expense' ? 'e' : ''}`), onError }
      );
    } else {
      const { repeat, ...entry } = values;
      const saved = `${what} enregistré${values.type === 'expense' ? 'e' : ''}`;
      createTransaction.mutate(
        { ...entry, id: newId, groupId: activeGroupId as string, userId: userId as string },
        {
          onSuccess: () => {
            if (!repeat) {
              succeed(saved);
              return;
            }
            // L'opération saisie est la première occurrence ; la récurrence propose la suivante. Si sa création échoue, la feuille reste ouverte sur l'erreur : un nouvel « Enregistrer » renvoie la même saisie (même id, sans doublon) puis retente la récurrence.
            const anchorDay = anchorFor(repeat, entry.occurredOn);
            recurringMutations.create.mutate(
              {
                groupId: activeGroupId as string,
                userId: userId as string,
                categoryId: entry.categoryId,
                type: entry.type,
                amount: entry.amount,
                note: entry.note,
                frequency: repeat,
                anchorDay,
                nextDueOn: nextDueAfter(repeat, anchorDay, entry.occurredOn),
              },
              {
                onSuccess: () =>
                  succeed(`${saved} · ${describeRecurrence(repeat, anchorDay).toLowerCase()}`),
                onError: (error) =>
                  setErrorText(
                    `Opération enregistrée, mais la répétition n’a pas pu être créée : ${dataErrorMessage(error)}`
                  ),
              }
            );
          },
          onError,
        }
      );
    }
    closeIfQueued();
  }

  function handleDelete() {
    if (typeof id !== 'string') {
      return;
    }
    deleteTransaction.mutate(id, { onSuccess: () => succeed('Opération supprimée'), onError });
    closeIfQueued();
  }

  const initialValues = existing.data
    ? {
        type: existing.data.type,
        amount: Number(existing.data.amount),
        categoryId: existing.data.category_id ?? '',
        occurredOn: existing.data.occurred_on,
        note: existing.data.note,
        repeat: null,
        walletId: existing.data.wallet_id,
      }
    : undefined;

  return (
    // sheetAllowedDetents: 'fitToContents' calcule la hauteur de la feuille à partir de celle du contenu ; flex: 1 empêcherait cette mesure (la vue s'étirerait pour remplir un espace disponible qui n'existe pas encore). maxHeight borne la feuille à une fraction de l'écran : le ScrollView ci-dessous devient alors le seul à défiler, clavier ouvert compris, au lieu que fitToContents mesure un contenu plus haut que l'écran.
    <View style={[styles.sheet, { backgroundColor: colors.background, maxHeight: sheetMaxHeight }]}>
      {/* Une formSheet n'accepte pas de header natif : le titre et la fermeture sont du contenu ordinaire (spec, contrainte Android). Sur le web, la présentation retombe sur un écran plein sans navigation native : ce bouton est la seule sortie hors du retour navigateur. */}
      {/* Une seule ligne, titre et fermeture : l'en-tête sur trois lignes prenait un quart de la feuille, que le clavier réduit déjà de moitié. */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          {typeof id === 'string' ? 'Modifier l’opération' : 'Nouvelle opération'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer sans enregistrer"
          hitSlop={spacing.sm}
          onPress={() => goBackOr(router, '/')}
          style={styles.close}
        >
          <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} />
        </Pressable>
      </View>

      <SheetScrollView
        // La feuille centre ses blocs (`alignItems: 'center'`) : sans cette largeur explicite, le ScrollView se réduirait à la largeur de son contenu, que son propre conteneur exprime en pourcentage de lui — une mesure qui ne converge pas.
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // Sur Android, la feuille (BottomSheetBehavior) ne cède le geste qu’à un enfant dont le défilement imbriqué est activé, ce que le ScrollView de React Native ne fait pas par défaut : sans cette prop, la feuille captait tout glissement vers le bas pour se déplacer elle-même, et une fois le haut du formulaire masqué, on ne pouvait plus y remonter.
        nestedScrollEnabled
      >
        <TransactionForm
          groupId={activeGroupId}
          groupName={activeGroup?.name ?? ''}
          initialValues={initialValues}
          submitLabel="Enregistrer"
          submitting={isSaving}
          deleting={isDeleting}
          errorText={errorText}
          onSubmit={handleSubmit}
          onDelete={typeof id === 'string' ? handleDelete : undefined}
          allowRepeat={typeof id !== 'string' && online}
        />
      </SheetScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    // Le fond garde la pleine largeur de la feuille ; ce sont les blocs qui se centrent, sur la même colonne que les écrans (voir `contentColumn`). Sans cela, le contenu d'une feuille s'étalait d'un bord à l'autre sur une tablette là où les cartes des écrans s'arrêtent à 420 points.
    alignItems: 'center',
  },
  header: {
    ...contentColumn,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingHorizontal: CONTENT_GUTTER + spacing.xs,
  },
  close: {
    // 44 points de zone tactile sans grossir l'icône.
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    alignSelf: 'stretch',
  },
  scrollContent: {
    ...contentColumn,
    flexGrow: 1,
  },
  centered: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontFamily: font.black,
    fontSize: 24,
    letterSpacing: -0.6,
    flexShrink: 1,
  },
  errorTitle: {
    fontFamily: font.medium,
    fontSize: 17,
    textAlign: 'center',
  },
});
