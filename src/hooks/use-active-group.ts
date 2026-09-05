import { useContext } from 'react';

import { ActiveGroupContext, type ActiveGroupState } from '@/providers/active-group-provider';

export function useActiveGroup(): ActiveGroupState {
  const context = useContext(ActiveGroupContext);
  if (!context) {
    throw new Error('useActiveGroup doit être utilisé à l’intérieur de <ActiveGroupProvider>.');
  }
  return context;
}
