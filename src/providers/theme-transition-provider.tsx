import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { captureRef, releaseCapture } from 'react-native-view-shot';

import { createThemeTransition, type TransitionTimings } from '@/lib/theme-transition';

/** Durées en millisecondes ; le rôle de chacune est décrit sur `TransitionTimings`. */
const TIMINGS: TransitionTimings = {
  captureTimeoutMs: 1000,
  loadTimeoutMs: 800,
  paintMs: 50,
  settleMs: 60,
  revealMs: 250,
  recoverMs: 80,
};

export type ThemeTransition = {
  /** Joue le fondu autour de `apply`, qui doit changer le thème. Avec « réduire les animations », `apply` est appelé tout de suite et sans fondu. */
  run: (apply: () => void) => void;
};

export const ThemeTransitionContext = createContext<ThemeTransition | null>(null);

/**
 * Adoucit le changement de thème, qui bascule sinon en une image.
 *
 * `useColors()` renvoie des couleurs statiques lues au rendu : animer chaque composant de l'un à l'autre obligerait à toucher tout l'écran. On photographie donc l'écran juste avant le changement, on pose la photo par-dessus, le thème change dessous, puis la photo s'efface : l'ancien écran s'efface directement sur le nouveau. Un simple voile uni ferait passer l'écran par une image entièrement claire ou sombre.
 *
 * La logique — ordre des étapes, courses entre deux choix, garde-fous — est dans `createThemeTransition`, testée sous Jest. Ce composant ne fait que fournir la capture, la photo et son fondu.
 *
 * Si la capture échoue — ancien build sans le module natif `react-native-view-shot` —, le thème change sans fondu : le fondu est un confort, jamais une condition du changement. La photo ne couvre pas les feuilles de dialogue natives (`formSheet`), rendues au-dessus de la racine : l'écran des paramètres, d'où le thème se change, est empilé et non une feuille.
 */
export function ThemeTransitionProvider({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const contentRef = useRef<View>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const opacity = useSharedValue(1);

  const transition = useRef<ReturnType<typeof createThemeTransition> | null>(null);

  // Créé dans un effet et non au rendu : la capture lit `contentRef`, qui n'existe qu'une fois la vue montée.
  useEffect(() => {
    const created = createThemeTransition(
      {
        // `collapsable={false}` sur la vue photographiée : sans lui, Android peut l'aplatir et n'a plus de vue native à capturer.
        capture: () => captureRef(contentRef, { format: 'png', result: 'tmpfile' }),
        release: releaseCapture,
        showSnapshot: (uri) => {
          opacity.set(1);
          setSnapshot(uri);
        },
        fade: (target, durationMs) => {
          opacity.set(withTiming(target, { duration: durationMs }));
        },
        hideSnapshot: () => setSnapshot(null),
      },
      TIMINGS
    );
    transition.current = created;
    return () => {
      created.dispose();
      transition.current = null;
    };
  }, [opacity]);

  const value = useMemo<ThemeTransition>(
    () => ({
      run: (apply) => {
        // Sans contrôleur — avant le premier effet, ou démonté — le thème change simplement, sans fondu.
        if (reduceMotion || transition.current === null) {
          apply();
        } else {
          transition.current.run(apply);
        }
      },
    }),
    [reduceMotion]
  );

  const snapshotStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <ThemeTransitionContext.Provider value={value}>
      <View ref={contentRef} collapsable={false} style={styles.content}>
        {children}
      </View>
      {snapshot ? (
        <Animated.Image
          source={{ uri: snapshot }}
          // Le fondu par défaut d'Android (300 ms) ferait apparaître la photo au lieu de la poser d'emblée.
          fadeDuration={0}
          onLoad={() => transition.current?.snapshotLoaded()}
          onError={() => transition.current?.snapshotFailed()}
          style={[StyleSheet.absoluteFill, styles.snapshot, snapshotStyle]}
        />
      ) : null}
    </ThemeTransitionContext.Provider>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  snapshot: {
    // Même vue, même taille : rien à rogner, et un rapport légèrement différent après arrondi se déformerait moins qu'il ne se recadrerait.
    resizeMode: 'stretch',
    // La photo ne capte aucun toucher : ils passent à l'écran vivant dessous.
    pointerEvents: 'none',
  },
});
