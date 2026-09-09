import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  create,
  remove,
  update,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from '@/data/budgets';
import { queryKeys } from '@/lib/query-keys';

/**
 * Création, modification et suppression d'un budget.
 *
 * L'invalidation porte sur la racine `queryKeys.budgetsAll()` : chaque mutation
 * invalide la clé par groupe du groupe réellement muté, pas du groupe actif au
 * moment où la réponse arrive. Un utilisateur peut basculer de groupe entre le
 * déclenchement de la mutation et la réception de la réponse — l'invalidation
 * doit ignorer le groupe actif courant et invalider tous les budgets en cache.
 */
export function useBudgetMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.budgetsAll(),
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
