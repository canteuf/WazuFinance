import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createDebt,
  deleteDebt,
  recordDebtPayment,
  type CreateDebtInput,
  type RecordDebtPaymentInput,
} from '@/data/debts';
import { queryKeys } from '@/lib/query-keys';

/**
 * Création, remboursement et suppression d'une dette. Chacune déplace de l'argent dans le solde : toutes invalident la racine ['transactions'], sous laquelle vivent aussi les dettes elles-mêmes.
 *
 * Aucune ne patiente hors ligne (networkMode 'always' par défaut) : un remboursement mis en file pourrait arriver après qu'un autre membre a soldé la dette, et l'erreur ne trouverait plus d'écran où s'afficher.
 */
export function useDebtMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
  }

  const create = useMutation({
    mutationFn: (input: CreateDebtInput) => createDebt(input),
    onSuccess: invalidate,
  });

  const pay = useMutation({
    mutationFn: (input: RecordDebtPaymentInput) => recordDebtPayment(input),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDebt(id),
    onSuccess: invalidate,
  });

  return { create, pay, remove };
}
