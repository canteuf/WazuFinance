import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  confirmRecurring,
  createRecurring,
  removeRecurring,
  skipRecurring,
  type ConfirmRecurringInput,
  type CreateRecurringInput,
} from '@/data/recurring';
import { queryKeys } from '@/lib/query-keys';

/**
 * Création, confirmation, passage et suppression d'un modèle récurrent.
 *
 * Aucune ne patiente hors ligne : elles échouent aussitôt avec « Pas de connexion » (networkMode 'always' par défaut, voir query-provider). Une confirmation mise en file pourrait arriver après qu'un autre membre a traité la même échéance, et l'alerte ne dirait plus rien d'utile une fois l'écran fermé.
 */
export function useRecurringMutations() {
  const queryClient = useQueryClient();

  function invalidateRecurring() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.recurringAll() });
  }

  const create = useMutation({
    mutationFn: (input: CreateRecurringInput) => createRecurring(input),
    onSuccess: invalidateRecurring,
  });

  const confirm = useMutation({
    mutationFn: (input: ConfirmRecurringInput) => confirmRecurring(input),
    onSuccess: () => {
      invalidateRecurring();
      // L'échéance devient une opération : solde, listes, répartition et budgets en dépendent, tous rangés sous ['transactions'].
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
    },
    // Même si la base a refusé (échéance déjà traitée par un autre membre), la liste affichée est périmée : on la recharge pour que l'élément disparaisse.
    onError: invalidateRecurring,
  });

  const skip = useMutation({
    mutationFn: ({ id, dueOn }: { id: string; dueOn: string }) => skipRecurring(id, dueOn),
    onSettled: invalidateRecurring,
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeRecurring(id),
    onSuccess: invalidateRecurring,
  });

  return { create, confirm, skip, remove };
}
