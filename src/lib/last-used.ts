import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TransactionType } from '@/types/database';

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

/**
 * Dernier type saisi (dépense ou revenu), par groupe.
 *
 * Il va avec la dernière catégorie : une commerçante qui enchaîne les ventes les enregistre en revenus « Commerce ». Sans lui, le formulaire repartait sur « Dépense », la catégorie retenue n'appartenait plus à la liste affichée, et une vente coûtait deux touchers de plus.
 */
export async function readLastType(groupId: string): Promise<TransactionType | null> {
  try {
    const stored = await AsyncStorage.getItem(`last-type:${groupId}`);
    return stored === 'expense' || stored === 'income' ? stored : null;
  } catch {
    return null;
  }
}

export async function writeLastType(groupId: string, type: TransactionType): Promise<void> {
  try {
    await AsyncStorage.setItem(`last-type:${groupId}`, type);
  } catch {
    // Préférence d'affichage seulement.
  }
}

/**
 * Dernier groupe ouvert, par compte : l'app rouvre sur lui au lieu de revenir au compte personnel.
 *
 * Sans cela, le lecteur d'une tontine rouvrait l'app sur son compte personnel, lisait « 0 FCFA » et croyait la caisse vide. La clé porte l'identifiant du compte : un autre compte connecté sur le même téléphone a son propre choix. Un groupe quitté depuis n'est pas rouvert : ActiveGroupProvider ne retient le choix que s'il figure encore dans les adhésions.
 */
export async function readLastGroup(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(`last-group:${userId}`);
  } catch {
    return null;
  }
}

export async function writeLastGroup(userId: string, groupId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`last-group:${userId}`, groupId);
  } catch {
    // Préférence d'affichage seulement.
  }
}
