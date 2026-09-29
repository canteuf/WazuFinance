import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import type { RejectedWrite } from '@/lib/rejected-writes';
import { readRejected, removeRejected, subscribeRejected } from '@/lib/rejected-writes-store';

/**
 * La liste « À corriger » du compte connecté, relue à chaque changement (un nouveau refus, une ligne traitée). `isLoaded` reste faux le temps de la première lecture, que le formulaire attend avant de se pré-remplir.
 */
export function useRejectedWrites(): {
  items: RejectedWrite[];
  isLoaded: boolean;
  dismiss: (id: string) => void;
} {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [state, setState] = useState<{ userId: string; items: RejectedWrite[] } | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let active = true;
    const load = () => {
      void readRejected(userId).then((items) => {
        if (active) {
          setState({ userId, items });
        }
      });
    };
    load();
    const unsubscribe = subscribeRejected(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  const dismiss = useCallback(
    (id: string) => {
      if (userId) {
        void removeRejected(userId, id);
      }
    },
    [userId]
  );

  const current = state !== null && state.userId === userId ? state.items : [];
  return { items: current, isLoaded: state !== null && state.userId === userId, dismiss };
}
