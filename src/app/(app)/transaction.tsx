import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  TransactionForm,
  type TransactionFormValues,
} from '@/components/transaction/transaction-form';
import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import { useTransaction } from '@/hooks/use-transaction';
import { useTransactionMutations } from '@/hooks/use-transaction-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { font, spacing, useColors } from '@/theme/tokens';
import { goBackOr } from '@/lib/navigation';

/**
 * Une seule route pour les deux modes : création sans paramètre, édition avec ?id=. Le formulaire est ainsi écrit et corrigé une seule fois.
 */
export default function TransactionScreen() {
  const colors = useColors();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const { activeGroupId, isLoading: groupLoading, error: groupError } = useActiveGroup();
  const { createTransaction, updateTransaction, deleteTransaction, isSaving, isDeleting } =
    useTransactionMutations();
  const [errorText, setErrorText] = useState<string>();

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

  function handleSubmit(values: TransactionFormValues) {
    setErrorText(undefined);

    if (typeof id === 'string') {
      updateTransaction.mutate(
        { id, patch: values },
        {
          onSuccess: () => goBackOr(router, '/'),
          onError: (error) => setErrorText(dataErrorMessage(error)),
        }
      );
      return;
    }

    createTransaction.mutate(
      { ...values, groupId: activeGroupId as string, userId: userId as string },
      {
        onSuccess: () => goBackOr(router, '/'),
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  function handleDelete() {
    if (typeof id !== 'string') {
      return;
    }
    deleteTransaction.mutate(id, {
      onSuccess: () => goBackOr(router, '/'),
      onError: (error) => setErrorText(dataErrorMessage(error)),
    });
  }

  const initialValues = existing.data
    ? {
        type: existing.data.type,
        amount: Number(existing.data.amount),
        categoryId: existing.data.category_id ?? '',
        occurredOn: existing.data.occurred_on,
        note: existing.data.note,
      }
    : undefined;

  return (
    // sheetAllowedDetents: 'fitToContents' calcule la hauteur de la feuille à partir de celle du contenu ; flex: 1 empêcherait cette mesure (la vue s'étirerait pour remplir un espace disponible qui n'existe pas encore). maxHeight borne la feuille à une fraction de l'écran : le ScrollView ci-dessous devient alors le seul à défiler, clavier ouvert compris, au lieu que fitToContents mesure un contenu plus haut que l'écran.
    <View style={[styles.sheet, { backgroundColor: colors.background, maxHeight: windowHeight * 0.92 }]}>
      {/* Une formSheet n'accepte pas de header natif : le titre et la fermeture sont du contenu ordinaire (spec, contrainte Android). Sur le web, la présentation retombe sur un écran plein sans navigation native : ce bouton est la seule sortie hors du retour navigateur. */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {typeof id === 'string' ? 'Modifier l’opération' : 'Nouvelle opération'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          hitSlop={spacing.sm}
          onPress={() => goBackOr(router, '/')}
          style={styles.closeButton}
        >
          <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <TransactionForm
          groupId={activeGroupId}
          initialValues={initialValues}
          submitLabel={typeof id === 'string' ? 'Enregistrer' : 'Ajouter'}
          submitting={isSaving}
          deleting={isDeleting}
          errorText={errorText}
          onSubmit={handleSubmit}
          onDelete={typeof id === 'string' ? handleDelete : undefined}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  closeButton: {
    padding: spacing.xs,
  },
  scrollContent: {
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
    flexShrink: 1,
    fontFamily: font.bold,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  errorTitle: {
    fontFamily: font.medium,
    fontSize: 15,
    textAlign: 'center',
  },
});
