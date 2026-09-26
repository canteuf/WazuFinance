import { useContext } from 'react';

import { AppLockContext, type AppLockApi } from '@/providers/app-lock-context';

export function useAppLock(): AppLockApi {
  const context = useContext(AppLockContext);
  if (!context) {
    throw new Error('useAppLock doit être utilisé à l’intérieur de <AppLockProvider>.');
  }
  return context;
}
