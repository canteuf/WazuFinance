import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  adjustWalletBalance,
  createWallet,
  deleteWallet,
  transferBetweenWallets,
  updateWallet,
  type CreateWalletInput,
  type TransferInput,
} from '@/data/wallets';
import { queryKeys } from '@/lib/query-keys';
import type { WalletKind } from '@/types/database';

/**
 * Écritures sur les portefeuilles. Toutes invalident la racine ['transactions'] : les soldes et les transferts y vivent, et les frais d'un transfert sont une opération.
 *
 * Aucune ne patiente hors ligne (networkMode 'always' par défaut) : un transfert se fait en regardant ses soldes, qu'il vaut mieux voir à jour.
 */
export function useWalletMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
  }

  const create = useMutation({
    mutationFn: (input: CreateWalletInput) => createWallet(input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name: string; kind: WalletKind } }) =>
      updateWallet(id, patch),
    onSuccess: invalidate,
  });

  const adjust = useMutation({
    mutationFn: ({ id, actual }: { id: string; actual: number }) => adjustWalletBalance(id, actual),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteWallet(id),
    onSuccess: invalidate,
  });

  const transfer = useMutation({
    mutationFn: (input: TransferInput) => transferBetweenWallets(input),
    onSuccess: invalidate,
  });

  return { create, update, adjust, remove, transfer };
}
