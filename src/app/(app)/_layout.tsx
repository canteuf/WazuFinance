import { Stack } from 'expo-router';

import { useBudgetsRealtime } from '@/hooks/use-budgets-realtime';
import { useMembershipsRealtime } from '@/hooks/use-memberships-realtime';
import { useSavingsGoalsRealtime } from '@/hooks/use-savings-goals-realtime';
import { useTransactionsRealtime } from '@/hooks/use-transactions-realtime';
import { ActiveGroupProvider } from '@/providers/active-group-provider';

export default function AppLayout() {
  return (
    <ActiveGroupProvider>
      <AppStack />
    </ActiveGroupProvider>
  );
}

// Composant séparé : useTransactionsRealtime() et useBudgetsRealtime() consomment le contexte de ActiveGroupProvider via useActiveGroup(), donc ils doivent être montés sous le provider, pas à côté. useSavingsGoalsRealtime() n'en a pas besoin (portée utilisateur, pas groupe) mais reste monté ici, à côté de ses deux voisins, plutôt que dispersé dans un autre layout pour une raison purement technique.
function AppStack() {
  useTransactionsRealtime();
  useBudgetsRealtime();
  useSavingsGoalsRealtime();
  useMembershipsRealtime();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Les quatre destinations racines vivent dans (tabs) et partagent la barre d'onglets. Tout ce qui suit s'ouvre au-dessus d'elles : une pile pour les écrans pleins, une feuille pour les formulaires courts — dans les deux cas la barre disparaît, ce qui est la convention attendue d'un écran ouvert depuis un onglet. */}
      <Stack.Screen name="(tabs)" />
      {/* `slide_from_right` explicite sur les écrans pleins : `default` laisse chaque plateforme choisir sa propre animation (poussée iOS, fondu ou glissement Android selon la version), l'app ne se comportait donc pas de la même façon d'un appareil à l'autre. */}
      <Stack.Screen name="activity" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
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
  );
}
