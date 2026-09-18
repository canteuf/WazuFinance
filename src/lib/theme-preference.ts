import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

/** Choix de l'utilisateur. `system` suit le réglage du téléphone, et reste le défaut. */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme-preference';

/** Relit une valeur stockée. Toute valeur inconnue — ancienne version, stockage corrompu — retombe sur le réglage du téléphone plutôt que de forcer un thème que personne n'a choisi. */
export function parseThemePreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/**
 * Impose le thème à toute l'app.
 *
 * Passe par `Appearance.setColorScheme` plutôt que par un fournisseur de thème maison : `useColorScheme()` renvoie alors la valeur imposée partout, et `useColors()`, la navigation et les composants natifs suivent sans rien savoir de ce réglage. `unspecified` rend la main au téléphone.
 *
 * Absent sur le web, où react-native-web n'implémente pas la surcharge : l'app y suit le navigateur, et le choix reste simplement mémorisé.
 */
export function applyThemePreference(preference: ThemePreference): void {
  if (typeof Appearance.setColorScheme !== 'function') {
    return;
  }
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

/** Préférence d'affichage, pas une donnée : un échec de lecture retombe sur le réglage du téléphone. */
export async function readThemePreference(): Promise<ThemePreference> {
  try {
    return parseThemePreference(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export async function writeThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Le thème est déjà appliqué pour la session en cours ; seul le prochain démarrage l'oubliera.
  }
}
