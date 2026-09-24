import { createContext, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/** Hauteur mesurée de la zone qui porte la pile de l'app ; `null` avant la première mesure. */
export const StackFrameContext = createContext<number | null>(null);

/**
 * Mesure la place réellement laissée à la pile, sous le bandeau hors ligne.
 *
 * Sur Android, une feuille `formSheet` s'ouvre dans les limites de la pile, pas dans celles de la fenêtre. Quand le bandeau s'affiche, la pile perd sa hauteur ; une feuille bornée à une fraction de la fenêtre dépassait alors du bas de l'écran, et le bouton d'enregistrement disparaissait sous le bord. Les feuilles se bornent donc à cette mesure (useSheetMaxHeight).
 */
export function StackFrameProvider({ children }: { children: ReactNode }) {
  const [height, setHeight] = useState<number | null>(null);

  return (
    <View style={styles.frame} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
      <StackFrameContext.Provider value={height}>{children}</StackFrameContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
  },
});
