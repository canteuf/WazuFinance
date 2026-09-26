import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { subscribePendingInvite, takePendingInvite } from '@/lib/pending-invite';

/**
 * Ouvre « Rejoindre », pré-rempli, quand un lien d'invitation a été touché (voir `+native-intent.tsx`).
 *
 * Monté sous la garde de session : le code attend dans le stockage tant que personne n'est connecté, et l'écran s'ouvre au premier rendu de l'app connectée — après une inscription comme après une reconnexion. Ce n'est pas une redirection après authentification : l'accueil reste en dessous, la feuille s'ouvre par-dessus, comme si l'utilisateur l'avait ouverte lui-même.
 */
export function usePendingInvite(): void {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    function open() {
      void takePendingInvite().then((code) => {
        if (active && code !== null) {
          router.push(`/group-join?code=${code}`);
        }
      });
    }

    open();
    const unsubscribe = subscribePendingInvite(open);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);
}
