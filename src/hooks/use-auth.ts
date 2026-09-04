import { useContext } from 'react';

import { AuthContext, type AuthState } from '@/providers/auth-provider';

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>.');
  }
  return context;
}
