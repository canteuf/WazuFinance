import { useMutation, useQueryClient } from '@tanstack/react-query';

import { adjust, create, remove, type CreateBudgetInput } from '@/data/budgets';
import { queryKeys } from '@/lib/query-keys';

/**
 * Création, ajustement du plafond et suppression d'un budget.
 *
 * L'invalidation porte sur la racine `queryKeys.budgetsAll()` : chaque mutation invalide la clé par groupe du groupe réellement muté, pas du groupe actif au moment où la réponse arrive. Un utilisateur peut basculer de groupe entre le déclenchement de la mutation et la réception de la réponse — l'invalidation doit ignorer le groupe actif courant et invalider tous les budgets en cache.
 */
export function useBudgetMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.budgetsAll(),
    });
    // Les totaux d'en-tête vivent sous ['transactions'] (voir query-keys.ts) : la racine des budgets ne les atteint pas.
    void queryClient.invalidateQueries({ queryKey: queryKeys.budgetTotalsAll() });
  }

  const createBudget = useMutation({
    mutationFn: (input: CreateBudgetInput) => create(input),
    onSuccess: invalidate,
  });

  const adjustBudget = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) => adjust(id, delta),
    onSuccess: invalidate,
  });

  const deleteBudget = useMutation({
    mutationFn: (id: string) => remove(id),
    onSuccess: invalidate,
  });

  return {
    createBudget,
    adjustBudget,
    deleteBudget,
    // Deux indicateurs distincts, comme pour les transactions : un seul agrégé faisait tourner le bouton Supprimer pendant l'enregistrement.
    isSaving: createBudget.isPending || adjustBudget.isPending,
    isDeleting: deleteBudget.isPending,
  };
}
