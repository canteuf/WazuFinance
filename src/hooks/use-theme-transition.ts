import { useContext } from 'react';

import { ThemeTransitionContext, type ThemeTransition } from '@/providers/theme-transition-provider';

export function useThemeTransition(): ThemeTransition {
  const context = useContext(ThemeTransitionContext);
  if (!context) {
    throw new Error('useThemeTransition doit être utilisé à l’intérieur de <ThemeTransitionProvider>.');
  }
  return context;
}
