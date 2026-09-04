import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  TransactionForm,
  type TransactionFormValues,
} from '@/components/transaction/transaction-form';
import { getById } from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useAuth } from '@/hooks/use-auth';
import { useTransactionMutations } from '@/hooks/use-transaction-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { queryKeys } from '@/lib/query-keys';
import { spacing, useColors } from '@/theme/tokens';

/**
 * Une seule route pour les deux modes : création sans paramètre, édition avec
 * ?id=. Le formulaire est ainsi écrit et corrigé une seule fois.
 */
export default function TransactionScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const { activeGroupId } = useActiveGroup();
  const { createTransaction, updateTransaction, deleteTransaction, isPending } =
    useTransactionMutations();
  const [errorText, setErrorText] = useState<string>();

  const existing = useQuery({
    queryKey: queryKeys.transaction(id ?? ''),
    queryFn: () => getById(id as string),
    enabled: typeof id === 'string',
  });

  const userId = session?.user.id;

  // Tous les hooks ci-dessus s'exécutent à chaque rendu ; les retours
  // conditionnels qui suivent n'en court-circuitent aucun.
  if (!activeGroupId || !userId) {
    return null;
  }

  if (typeof id === 'string' && existing.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  function handleSubmit(values: TransactionFormValues) {
    setErrorText(undefined);

    if (typeof id === 'string') {
      updateTransaction.mutate(
        { id, patch: values },
        {
          onSuccess: () => router.back(),
          onError: (error) => setErrorText(dataErrorMessage(error)),
        }
      );
      return;
    }

    createTransaction.mutate(
      { ...values, groupId: activeGroupId as string, userId: userId as string },
      {
        onSuccess: () => router.back(),
        onError: (error) => setErrorText(dataErrorMessage(error)),
      }
    );
  }

  function handleDelete() {
    if (typeof id !== 'string') {
      return;
    }
    deleteTransaction.mutate(id, {
      onSuccess: () => router.back(),
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
    <View style={[styles.sheet, { backgroundColor: colors.background }]}>
      {/* Une formSheet n'accepte pas de header natif : le titre est du contenu. */}
      <Text style={[styles.title, { color: colors.text }]}>
        {typeof id === 'string' ? 'Modifier l’opération' : 'Nouvelle opération'}
      </Text>

      <TransactionForm
        groupId={activeGroupId}
        initialValues={initialValues}
        submitLabel={typeof id === 'string' ? 'Enregistrer' : 'Ajouter'}
        submitting={isPending}
        errorText={errorText}
        onSubmit={handleSubmit}
        onDelete={typeof id === 'string' ? handleDelete : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // sheetAllowedDetents: 'fitToContents' calcule la hauteur de la feuille à
  // partir de celle du contenu ; flex: 1 empêcherait cette mesure (la vue
  // s'étirerait pour remplir un espace disponible qui n'existe pas encore).
  sheet: {},
  centered: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
});
