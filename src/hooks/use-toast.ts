import { useContext } from 'react';

import { ToastContext, type ToastApi } from '@/providers/toast-provider';

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast doit être utilisé à l’intérieur de <ToastProvider>.');
  }
  return context;
}
