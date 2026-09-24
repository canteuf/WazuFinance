import { useContext } from 'react';
import { useWindowDimensions } from 'react-native';

import { StackFrameContext } from '@/providers/stack-frame-provider';

/** Part de la hauteur disponible qu'une feuille peut occuper : le reste laisse voir l'écran dessous, et rappelle qu'on peut la fermer. */
const SHEET_HEIGHT_RATIO = 0.92;

/**
 * Hauteur maximale d'une feuille de formulaire : une fraction de la place laissée à la pile, qui rétrécit quand le bandeau hors ligne s'affiche (voir StackFrameProvider). Avant la première mesure, la fenêtre sert de repli.
 */
export function useSheetMaxHeight(): number {
  const frame = useContext(StackFrameContext);
  const { height: windowHeight } = useWindowDimensions();
  return (frame ?? windowHeight) * SHEET_HEIGHT_RATIO;
}
