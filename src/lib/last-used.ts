import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Dernière catégorie utilisée, par groupe.
 *
 * C'est ce qui fait tomber la saisie courante à un seul tap après le montant (spec 4.3). La clé est par groupe : les habitudes du budget partagé n'ont rien à voir avec celles du compte personnel.
 *
 * Une préférence d'affichage, pas une donnée : en cas d'échec de lecture ou d'écriture, le formulaire retombe simplement sur aucune présélection.
 */
function storageKey(groupId: string): string {
  return `last-category:${groupId}`;
}

export async function readLastCategory(groupId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(storageKey(groupId));
  } catch {
    return null;
  }
}

export async function writeLastCategory(groupId: string, categoryId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(groupId), categoryId);
  } catch {
    // Sans effet sur la transaction enregistrée : on ne remonte pas l'erreur.
  }
}

/** Dernier portefeuille utilisé, par groupe : même principe que la catégorie, pour que la saisie courante ne demande pas un geste de plus. */
export async function readLastWallet(groupId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(`last-wallet:${groupId}`);
  } catch {
    return null;
  }
}

export async function writeLastWallet(groupId: string, walletId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`last-wallet:${groupId}`, walletId);
  } catch {
    // Préférence d'affichage seulement.
  }
}
