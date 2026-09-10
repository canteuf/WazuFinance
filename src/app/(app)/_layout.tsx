import { Stack } from 'expo-router';

import { useBudgetsRealtime } from '@/hooks/use-budgets-realtime';
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
function AppStack() {
  useTransactionsRealtime();
  useBudgetsRealtime();

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
