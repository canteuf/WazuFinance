import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  addToSavingsGoal,
  createSavingsGoal,
  deleteSavingsGoal,
  updateSavingsGoal,
  type CreateSavingsGoalInput,
  type UpdateSavingsGoalInput,
} from '@/data/savings-goals';
import { todayIso } from '@/lib/dates';
import { queryKeys } from '@/lib/query-keys';

/** Création, modification, versement et suppression d'un objectif d'épargne. */
export function useSavingsGoalMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.savingsGoals() });
  }

  const createGoal = useMutation({
    mutationFn: (input: CreateSavingsGoalInput) => createSavingsGoal(input),
    onSuccess: invalidate,
  });

  const updateGoal = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSavingsGoalInput }) =>
      updateSavingsGoal(id, patch),
    onSuccess: invalidate,
  });

  const addToGoal = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      addToSavingsGoal(id, delta, todayIso()),
    onSuccess: () => {
      invalidate();
      // Le versement est aussi une opération du compte personnel : solde, historique et totaux en dépendent, tous rangés sous ['transactions'].
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
    },
  });

  const deleteGoal = useMutation({
    mutationFn: (id: string) => deleteSavingsGoal(id),
    onSuccess: invalidate,
  });

  return {
    createGoal,
    updateGoal,
    addToGoal,
    deleteGoal,
    // Deux indicateurs distincts, comme pour les transactions et les budgets : un seul agrégé faisait tourner le bouton Supprimer pendant l'enregistrement.
    isSaving: createGoal.isPending || updateGoal.isPending,
    isDeleting: deleteGoal.isPending,
  };
}
