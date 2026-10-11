import { useNavigation } from 'expo-router';
import type { NativeStackNavigationProp } from 'expo-router/native-stack';
import type { ParamListBase } from 'expo-router/react-navigation';
import { useEffect, useState, type RefObject } from 'react';
import type { TextInput } from 'react-native';

/** Repli quand l'écran n'annonce pas la fin de son ouverture (un onglet n'a pas de transition) : au-delà, on considère qu'elle est finie. */
const TRANSITION_FALLBACK_MS = 600;

/** Vrai une fois l'écran ou la feuille qui contient ce composant arrivé à sa place. */
export function useTransitionSettled(): boolean {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (settled) {
      return;
    }
    const fallback = setTimeout(() => setSettled(true), TRANSITION_FALLBACK_MS);
    const unsubscribe = navigation.addListener('transitionEnd', (event) => {
      // Lu sans présumer de `data` : dans un onglet, `useNavigation()` renvoie la navigation par onglets, dont le `transitionEnd` n'a pas de `data` — le lire tel quel plantait chaque onglet. Le type de la pile le déclare toujours présent, à tort ici.
      const data = event.data as { closing?: boolean } | undefined;
      if (!data?.closing) {
        setSettled(true);
      }
    });
    return () => {
      clearTimeout(fallback);
      unsubscribe();
    };
  }, [navigation, settled]);

  return settled;
}

/**
 * Donne le focus au champ une fois l'écran ou la feuille arrivé à sa place, au lieu de `autoFocus`.
 *
 * Avec `autoFocus`, le clavier s'ouvrait pendant que la feuille glissait encore depuis le bas : react-native-screens calculait la remontée de la feuille au-dessus du clavier en plein mouvement, et le contenu partait trop haut — les feuilles « Créer un groupe » et « Rejoindre » paraissaient vides, le champ et le bouton passés au-dessus de la partie visible (Pixel 7, APK 1.1.3). Les feuilles où l'on touche soi-même le champ, une fois arrivées, n'avaient jamais ce défaut : on reproduit ce cas-là. Le clavier apparaît une fraction de seconde plus tard, sans geste en plus.
 */
export function useFocusOnceSettled(ref: RefObject<TextInput | null>): void {
  const settled = useTransitionSettled();

  useEffect(() => {
    if (settled) {
      ref.current?.focus();
    }
  }, [settled, ref]);
}
