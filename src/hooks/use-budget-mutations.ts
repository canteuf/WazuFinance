import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  create,
  remove,
  update,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from '@/data/budgets';
import { useActiveGroup } from '@/hooks/use-active-group';
import { queryKeys } from '@/lib/query-keys';

/**
 * Création, modification et suppression d'un budget.
 *
 * L'invalidation porte sur `queryKeys.budgets(groupId)` seule : la
 * consommation vient de `category_breakdown`, que ces mutations ne changent
 * pas — un plafond déplacé ne déplace aucune dépense.
 */
export function useBudgetMutations() {
  const queryClient = useQueryClient();
  const { activeGroupId } = useActiveGroup();

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.budgets(activeGroupId ?? ''),
    });
  }

  const createBudget = useMutation({
    mutationFn: (input: CreateBudgetInput) => create(input),
    onSuccess: invalidate,
  });

  const updateBudget = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateBudgetInput }) => update(id, patch),
    onSuccess: invalidate,
  });

  const deleteBudget = useMutation({
    mutationFn: (id: string) => remove(id),
    onSuccess: invalidate,
  });

  return {
    createBudget,
    updateBudget,
    deleteBudget,
    // Deux indicateurs distincts, comme pour les transactions : un seul
    // agrégé faisait tourner le bouton Supprimer pendant l'enregistrement.
    isSaving: createBudget.isPending || updateBudget.isPending,
    isDeleting: deleteBudget.isPending,
  };
}
