import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import type { WalletKind } from '@/types/database';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Les types de portefeuille, dans l'ordre du sélecteur : l'icône et le libellé ne changent aucun calcul. */
export const WALLET_KINDS: { value: WalletKind; label: string; icon: IconName }[] = [
  { value: 'cash', label: 'Espèces', icon: 'cash' },
  { value: 'mobile_money', label: 'Mobile', icon: 'cellphone' },
  { value: 'bank', label: 'Banque', icon: 'bank-outline' },
  { value: 'other', label: 'Autre', icon: 'wallet-outline' },
];

export function walletIcon(kind: WalletKind): IconName {
  return WALLET_KINDS.find((item) => item.value === kind)?.icon ?? 'wallet-outline';
}
