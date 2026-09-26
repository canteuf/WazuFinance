import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createDebt,
  deleteDebt,
  type CreateDebtInput,
  type RecordDebtPaymentInput,
} from '@/data/debts';
import { mutationKeys, queryKeys } from '@/lib/query-keys';

/**
 * Création, remboursement et suppression d'une dette. Chacune déplace de l'argent dans le solde : toutes invalident la racine ['transactions'], sous laquelle vivent aussi les dettes elles-mêmes.
 *
 * Le remboursement patiente hors ligne : ses effets et sa fonction sont enregistrés avec ceux des saisies (`registerTransactionMutationDefaults`), sous une clé de la même file. Un remboursement refusé à l'envoi — la dette soldée entre-temps par un autre membre — lève l'alerte des écritures en file, puisque la feuille n'est plus là. La création et la suppression échouent aussitôt hors ligne (networkMode 'always' par défaut).
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

  const pay = useMutation<void, Error, RecordDebtPaymentInput>({
    mutationKey: mutationKeys.recordDebtPayment(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDebt(id),
    onSuccess: invalidate,
  });

  return { create, pay, remove };
}
