import { Stack } from 'expo-router';

import { useTransactionsRealtime } from '@/hooks/use-transactions-realtime';
import { ActiveGroupProvider } from '@/providers/active-group-provider';

export default function AppLayout() {
  return (
    <ActiveGroupProvider>
      <AppStack />
    </ActiveGroupProvider>
  );
}

// Composant séparé : useTransactionsRealtime() consomme le contexte de
// ActiveGroupProvider via useActiveGroup(), donc il doit être monté
// sous le provider, pas à côté.
function AppStack() {
  useTransactionsRealtime();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="history" />
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
