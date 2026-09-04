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

  useEffect(() => {
    if (!isLoading) {
      void SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
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
