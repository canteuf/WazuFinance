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
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { useAuth } from '@/hooks/use-auth';
import { useClearCacheOnUserChange } from '@/hooks/use-clear-cache-on-user-change';
import { AuthProvider } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();

  return (
    <QueryProvider>
      <AuthProvider>
        <CacheSessionGuard />
        <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
          <RootNavigator />
        </ThemeProvider>
      </AuthProvider>
    </QueryProvider>
  );
}

/**
 * Composant sans rendu : isolé de RootNavigator pour que la logique de garde
 * de navigation reste indépendante de la gestion du cache TanStack Query.
 */
function CacheSessionGuard() {
  useClearCacheOnUserChange();
  return null;
}

/**
 * Le splash reste affiché tant que la session persistée n'a pas été relue, pour
 * éviter le flash de l'écran de connexion chez un utilisateur déjà authentifié.
 */
function RootNavigator() {
  const { session, isLoading } = useAuth();
  // React Native n'a pas de police de repli par famille : tant que Bricolage
  // Grotesque n'est pas chargée, chaque écran s'afficherait dans la police
  // système puis se recomposerait. On garde donc le splash sur les deux
  // attentes à la fois.
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });

  // Un échec de chargement ne doit pas laisser l'app derrière son splash :
  // mieux vaut la police système que rien.
  const fontsSettled = fontsLoaded || fontError !== null;
  const ready = !isLoading && fontsSettled;

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
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
