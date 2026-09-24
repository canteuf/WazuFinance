import { useEffect, useState } from 'react';

import { useThemeTransition } from '@/hooks/use-theme-transition';
import {
  applyThemePreference,
  canOverrideTheme,
  readThemePreference,
  writeThemePreference,
  type ThemePreference,
} from '@/lib/theme-preference';

/**
 * Choix du thème, pour l'écran des paramètres.
 *
 * Le thème lui-même est déjà appliqué au démarrage par le layout racine ; ce hook ne sert qu'à afficher le choix courant et à le changer. L'écriture ne conditionne pas l'application : le changement se voit même si le stockage échoue.
 */
export function useThemePreference() {
  const { run } = useThemeTransition();
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
    // La sélection bouge avec le thème, sous la photo, et non au toucher : la capture part avant que le rendu du toucher soit peint, la photo montrait donc l'ancienne sélection, et le rectangle semblait aller sur le bouton touché, revenir sur l'ancien, puis repartir au fil du fondu.
    const apply = () => {
      setPreference(next);
      applyThemePreference(next);
    };
    // Le fondu n'a de sens que si le thème peut changer : sur le web, ou en retouchant le choix déjà actif, il ferait clignoter l'écran pour rien.
    if (next === preference || !canOverrideTheme()) {
      apply();
    } else {
      run(apply);
    }
    void writeThemePreference(next);
  }

  return { preference, choose };
}
