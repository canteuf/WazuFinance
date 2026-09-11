import { Stack } from 'expo-router';

import { useBudgetsRealtime } from '@/hooks/use-budgets-realtime';
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

// Composant séparé : useTransactionsRealtime() et useBudgetsRealtime()
// consomment le contexte de ActiveGroupProvider via useActiveGroup(), donc
// ils doivent être montés sous le provider, pas à côté.
// useSavingsGoalsRealtime() n'en a pas besoin (portée utilisateur, pas
// groupe) mais reste monté ici, à côté de ses deux voisins, plutôt que
// dispersé dans un autre layout pour une raison purement technique.
function AppStack() {
  useTransactionsRealtime();
  useBudgetsRealtime();
  useSavingsGoalsRealtime();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="history" />
      <Stack.Screen name="activity" />
      <Stack.Screen name="budgets" />
      <Stack.Screen
        name="budget"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
        }}
      />
      <Stack.Screen name="savings-goals" />
      <Stack.Screen
        name="savings-goal"
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
  );
}
