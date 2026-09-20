import { parseThemePreference } from '@/lib/theme-preference';

// Le module importe AsyncStorage, dont le module natif n'existe pas sous Jest : sans ce mock, le simple chargement du fichier échoue avant tout test.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('parseThemePreference', () => {
  it('relit les deux thèmes imposables', () => {
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
  });

  it('suit le téléphone quand rien n’est stocké', () => {
    expect(parseThemePreference(null)).toBe('system');
  });

  it('suit le téléphone sur une valeur inconnue plutôt que d’imposer un thème', () => {
    expect(parseThemePreference('sepia')).toBe('system');
    expect(parseThemePreference('')).toBe('system');
  });
});
