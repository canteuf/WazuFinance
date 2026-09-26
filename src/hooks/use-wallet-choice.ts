import { useEffect, useState } from 'react';

import type { WalletOverview } from '@/data/wallets';
import { useWallets } from '@/hooks/use-wallets';
import { readLastWallet } from '@/lib/last-used';

export type WalletChoice = {
  wallets: WalletOverview[];
  /** Le portefeuille à envoyer : `null` laisse la base prendre celui par défaut du groupe. */
  walletId: string | null;
  /** Le portefeuille à montrer coché : celui choisi, sinon celui par défaut. */
  selectedId: string | null;
  select: (id: string) => void;
  /** Vrai quand il y a un choix à faire : avec le seul « Principal », aucune feuille n'affiche le sélecteur. */
  showPicker: boolean;
};

/**
 * Le portefeuille d'une feuille de saisie : opération, prêt, remboursement, échéance, versement d'épargne. Une seule règle pour toutes, pour qu'aucune ne présélectionne autrement que les autres.
 *
 * `initial` : `undefined` en création, qui présélectionne le dernier portefeuille utilisé dans le groupe ; une valeur (ou `null`, le défaut) quand la feuille part d'une donnée existante — une opération modifiée, le portefeuille retenu par une opération récurrente.
 *
 * Un portefeuille supprimé entre-temps, ou mémorisé dans un autre groupe, retombe sur celui par défaut ; avant l'arrivée de la liste, la sélection est gardée telle quelle.
 */
export function useWalletChoice(groupId: string | null, initial?: string | null): WalletChoice {
  const { wallets } = useWallets(groupId);
  // Le choix explicite de l'utilisateur, seul état gardé : la présélection est dérivée à chaque rendu, pour suivre une valeur de départ qui arrive après le premier (un modèle récurrent encore en chargement).
  const [picked, setPicked] = useState<string | null>(null);
  const [lastUsed, setLastUsed] = useState<string | null>(null);
  const creating = initial === undefined;

  useEffect(() => {
    if (!creating || groupId === null) {
      return;
    }
    let active = true;
    readLastWallet(groupId).then((lastId) => {
      if (active) {
        setLastUsed(lastId);
      }
    });
    return () => {
      active = false;
    };
  }, [groupId, creating]);

  const selection = picked ?? (creating ? lastUsed : initial);
  const defaultWallet = wallets.find((wallet) => wallet.isDefault);
  const walletId =
    wallets.length === 0 || wallets.some((wallet) => wallet.id === selection)
      ? selection
      : (defaultWallet?.id ?? null);

  return {
    wallets,
    walletId,
    selectedId: walletId ?? defaultWallet?.id ?? null,
    select: setPicked,
    showPicker: wallets.length > 1,
  };
}
