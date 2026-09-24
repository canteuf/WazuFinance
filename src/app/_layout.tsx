import {
  BricolageGrotesque_400Regular,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { useAuth } from '@/hooks/use-auth';
import { usePersistedQueryCache } from '@/hooks/use-persisted-query-cache';
import { applyThemePreference, readThemePreference } from '@/lib/theme-preference';
import { AuthProvider } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';
import { ThemeTransitionProvider } from '@/providers/theme-transition-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();

  return (
    <QueryProvider>
      <AuthProvider>
        <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
          <ThemeTransitionProvider>
            <RootNavigator />
          </ThemeTransitionProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryProvider>
  );
}

/**
 * Le splash reste affiché tant que la session persistée n'a pas été relue, pour éviter le flash de l'écran de connexion chez un utilisateur déjà authentifié.
 */
function RootNavigator() {
  const { session, isLoading } = useAuth();
  const cacheRestored = usePersistedQueryCache();
  // React Native n'a pas de police de repli par famille : tant que Bricolage Grotesque n'est pas chargée, chaque écran s'afficherait dans la police système puis se recomposerait. On garde donc le splash sur les deux attentes à la fois.
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });

  // Un échec de chargement ne doit pas laisser l'app derrière son splash : mieux vaut la police système que rien.
  const fontsSettled = fontsLoaded || fontError !== null;

  // Le thème choisi est appliqué avant que le splash ne se retire : sinon le premier écran s'afficherait dans le thème du téléphone, puis basculerait sous les yeux de l'utilisateur. readThemePreference() ne lève jamais.
  const [themeSettled, setThemeSettled] = useState(false);
  useEffect(() => {
    void readThemePreference().then((preference) => {
      applyThemePreference(preference);
      setThemeSettled(true);
    });
  }, []);

  const ready = !isLoading && fontsSettled && themeSettled && cacheRestored;

  // La relecture du cache recommence à chaque connexion, pour le cache du nouveau compte. Seul le démarrage l'attend derrière le splash : après, les écrans ne doivent pas disparaître le temps de cette relecture, et un compte qui vient de se connecter charge de toute façon ses données en ligne.
  const [started, setStarted] = useState(false);
  if (ready && !started) {
    setStarted(true);
  }

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready && !started) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={session !== null}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={session === null}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
