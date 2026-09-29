import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TermsGate } from '@/components/legal/terms-gate';
import { OfflineBanner, useOfflineBannerVisible } from '@/components/ui/offline-banner';
import { useBudgetsRealtime } from '@/hooks/use-budgets-realtime';
import { useDailyOpenEvent } from '@/hooks/use-daily-open-event';
import { useMembershipsRealtime } from '@/hooks/use-memberships-realtime';
import { usePendingInvite } from '@/hooks/use-pending-invite';
import { useRecurringRealtime } from '@/hooks/use-recurring-realtime';
import { useSavingsGoalsRealtime } from '@/hooks/use-savings-goals-realtime';
import { useTransactionsRealtime } from '@/hooks/use-transactions-realtime';
import { useWalletsRealtime } from '@/hooks/use-wallets-realtime';
import { ActiveGroupProvider } from '@/providers/active-group-provider';
import { AppLockProvider } from '@/providers/app-lock-provider';
import { StackFrameProvider } from '@/providers/stack-frame-provider';
import { ToastProvider } from '@/providers/toast-provider';

export default function AppLayout() {
  return (
    // Tout en dehors : le verrou couvre l'app entière, feuilles ouvertes comprises (voir AppLockProvider).
    <AppLockProvider>
      <ActiveGroupProvider>
        {/* Autour de la pile : un message de confirmation doit survivre à la fermeture de la feuille qui l'a déclenché. */}
        <ToastProvider>
          <AppStack />
        </ToastProvider>
      </ActiveGroupProvider>
    </AppLockProvider>
  );
}

// Composant séparé : useTransactionsRealtime() et useBudgetsRealtime() consomment le contexte de ActiveGroupProvider via useActiveGroup(), donc ils doivent être montés sous le provider, pas à côté. useSavingsGoalsRealtime() n'en a pas besoin (portée utilisateur, pas groupe) mais reste monté ici, à côté de ses deux voisins, plutôt que dispersé dans un autre layout pour une raison purement technique.
function AppStack() {
  useTransactionsRealtime();
  useBudgetsRealtime();
  useSavingsGoalsRealtime();
  useMembershipsRealtime();
  useRecurringRealtime();
  useWalletsRealtime();
  usePendingInvite();
  useDailyOpenEvent();

  // Le bandeau affiché occupe la zone sûre du haut : sous lui, les écrans reçoivent des marges dont le haut vaut zéro, sans quoi chacun rajoutait la hauteur de la barre d'état entre le bandeau et son en-tête.
  const insets = useSafeAreaInsets();
  const bannerVisible = useOfflineBannerVisible();
  const stackInsets = useMemo(
    () => (bannerVisible ? { ...insets, top: 0 } : insets),
    [bannerVisible, insets]
  );

  return (
    <View style={styles.root}>
      {/* Au-dessus de la pile et non dans chaque écran : l'état de la connexion concerne toute l'app, et les quatre onglets gèrent leur haut d'écran chacun à sa façon (voir AccountButton). */}
      <OfflineBanner />
      <SafeAreaInsetsContext.Provider value={stackInsets}>
        <StackFrameProvider>
          <Stack screenOptions={{ headerShown: false }}>
            {/* Les quatre destinations racines vivent dans (tabs) et partagent la barre d'onglets. Tout ce qui suit s'ouvre au-dessus d'elles : une pile pour les écrans pleins, une feuille pour les formulaires courts — dans les deux cas la barre disparaît, ce qui est la convention attendue d'un écran ouvert depuis un onglet. */}
            <Stack.Screen name="(tabs)" />
            {/* `slide_from_right` explicite sur les écrans pleins : `default` laisse chaque plateforme choisir sa propre animation (poussée iOS, fondu ou glissement Android selon la version), l'app ne se comportait donc pas de la même façon d'un appareil à l'autre. */}
            <Stack.Screen name="activity" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="app-lock-setup" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen
              name="budget"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: 24,
              }}
            />
            <Stack.Screen
              name="savings-goal"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: 24,
              }}
            />
            <Stack.Screen name="groups" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen
              name="group-create"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: 24,
              }}
            />
            <Stack.Screen
              name="group-join"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: 24,
              }}
            />
            <Stack.Screen name="group" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="recurring-list" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="debts" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="wallets" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen
              name="wallet"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: 24,
              }}
            />
            <Stack.Screen
              name="wallet-transfer"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: 24,
              }}
            />
            <Stack.Screen
              name="debt"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: 24,
              }}
            />
            <Stack.Screen
              name="recurring"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: 24,
              }}
            />
            <Stack.Screen
              name="transaction"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: 24,
              }}
            />
          </Stack>
        </StackFrameProvider>
      </SafeAreaInsetsContext.Provider>
      <TermsGate />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
