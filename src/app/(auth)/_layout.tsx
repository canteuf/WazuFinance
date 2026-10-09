import { Stack } from 'expo-router';

// sign-in est déclaré en premier : c'est l'écran vers lequel retombe la pile quand la garde de session bloque l'accès au groupe (app).
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="confirm-email" />
    </Stack>
  );
}
