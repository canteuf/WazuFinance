import { useEffect, useState } from 'react';

import {
  applyThemePreference,
  readThemePreference,
  writeThemePreference,
  type ThemePreference,
} from '@/lib/theme-preference';

/**
 * Choix du thème, pour l'écran des paramètres.
 *
 * Le thème lui-même est déjà appliqué au démarrage par le layout racine ; ce hook ne sert qu'à afficher le choix courant et à le changer. L'application précède l'écriture : le changement se voit tout de suite, même si le stockage échoue.
 */
export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    void readThemePreference().then((stored) => {
      if (active) {
        setPreference(stored);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  function choose(next: ThemePreference) {
    setPreference(next);
    applyThemePreference(next);
    void writeThemePreference(next);
  }

  return { preference, choose };
}
