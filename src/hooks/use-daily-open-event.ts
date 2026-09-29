import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { logProductEvent } from '@/data/account';
import { useAuth } from '@/hooks/use-auth';
import { todayIso } from '@/lib/dates';

/**
 * Enregistre l'ouverture du jour (`app_opened`) au lancement et à chaque retour au premier plan, une fois par jour et par compte.
 *
 * La base ignore déjà un deuxième événement du même jour ; se souvenir du dernier jour envoyé épargne seulement la requête, ce qui compte sur un forfait data. En mémoire et non sur le disque : au pire, un redémarrage renvoie une requête que la base ignorera.
 */
export function useDailyOpenEvent() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }

    function logIfNewDay() {
      const key = `${userId}:${todayIso()}`;
      if (lastSent.current === key) {
        return;
      }
      lastSent.current = key;
      void logProductEvent('app_opened');
    }

    logIfNewDay();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        logIfNewDay();
      }
    });
    return () => subscription.remove();
  }, [userId]);
}
