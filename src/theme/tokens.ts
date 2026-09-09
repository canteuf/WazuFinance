import { StyleSheet, useColorScheme } from 'react-native';

/**
 * Jetons de design partagés.
 *
 * Deux palettes, une seule grammaire de formes. En clair, « Carnet » : fond
 * vert-gris pâle, cartes blanches, ombres basses. En sombre, « Nocturne » :
 * fond profond, surfaces en élévation, accent menthe. La typographie, les
 * rayons et les densités ne changent pas avec le thème — les faire varier
 * imposerait deux mises en page à tenir et rendrait la bascule visible.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** Formes généreuses : 16 px est le rayon de référence des cartes et champs. */
export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

/**
 * Bricolage Grotesque, chargée dans le layout racine.
 *
 * React Native n'a pas d'héritage de police : chaque `Text` doit porter sa
 * famille. D'où ces constantes, à utiliser partout plutôt que `fontWeight`,
 * qui ne sélectionne pas la bonne graisse d'une famille chargée fichier par
 * fichier.
 */
export const font = {
  regular: 'BricolageGrotesque_400Regular',
  medium: 'BricolageGrotesque_500Medium',
  semibold: 'BricolageGrotesque_600SemiBold',
  bold: 'BricolageGrotesque_700Bold',
  black: 'BricolageGrotesque_800ExtraBold',
} as const;

export type Colors = {
  background: string;
  surface: string;
  /** Surface secondaire : fonds de segments, pastilles neutres. */
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  /** Revenus. Distinct de `primary` : une couleur sémantique, pas l'accent. */
  positive: string;
  /**
   * Avertissement : budget proche de son plafond. Sémantique, pas décoratif.
   * Sert aussi de couleur de texte (pas seulement de barre) : la valeur
   * claire est choisie pour tenir le contraste AA d'un texte, pas d'un simple
   * aplat.
   */
  warning: string;
  danger: string;
};

const palette: Record<'light' | 'dark', Colors> = {
  // Carnet
  light: {
    background: '#EDF1F0',
    surface: '#FFFFFF',
    surfaceMuted: '#E3E9E7',
    border: '#DDE5E2',
    text: '#12201C',
    textMuted: '#5E6E69',
    primary: '#0EA47A',
    primaryText: '#FFFFFF',
    positive: '#0B8F6A',
    warning: '#8C5A00',
    danger: '#C4362B',
  },
  // Nocturne
  dark: {
    background: '#0B0F14',
    surface: '#151B23',
    surfaceMuted: '#1C242E',
    border: '#212A34',
    text: '#EEF2F6',
    textMuted: '#8894A2',
    primary: '#3DDC97',
    primaryText: '#05231B',
    positive: '#3DDC97',
    warning: '#F2B544',
    danger: '#F97066',
  },
};

/**
 * Élévation. En clair, une ombre basse détache la carte du fond ; en sombre,
 * une ombre portée ne se voit pas — c'est la surface plus claire qui fait
 * l'élévation, et l'ombre ne sert qu'à ancrer les éléments flottants.
 */
export type Elevation = {
  card: {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
    // Une ombre noire sur fond sombre ne se voit pas : en Nocturne, la
    // séparation d'une surface vient d'un liseré, pas d'une ombre. En Carnet
    // l'ombre suffit et le liseré est à zéro.
    borderWidth: number;
    borderColor: string;
  };
  floating: {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
  };
};

const elevation: Record<'light' | 'dark', Elevation> = {
  light: {
    card: {
      shadowColor: '#12201C',
      shadowOpacity: 0.06,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
      borderWidth: 0,
      borderColor: 'transparent',
    },
    floating: {
      shadowColor: '#0EA47A',
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
  },
  dark: {
    card: {
      shadowColor: '#000000',
      shadowOpacity: 0.3,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: '#212A34',
    },
    floating: {
      shadowColor: '#3DDC97',
      shadowOpacity: 0.3,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
  },
};

function scheme(value: ReturnType<typeof useColorScheme>): 'light' | 'dark' {
  return value === 'dark' ? 'dark' : 'light';
}

export function useColors(): Colors {
  return palette[scheme(useColorScheme())];
}

export function useElevation(): Elevation {
  return elevation[scheme(useColorScheme())];
}

/** Le thème courant, pour les rares composants qui doivent trancher eux-mêmes. */
export function useIsDark(): boolean {
  return scheme(useColorScheme()) === 'dark';
}

/**
 * Échelle de police système au-delà de laquelle une rangée de deux colonnes
 * doit s'empiler.
 *
 * En dessous, deux blocs tiennent côte à côte sur un téléphone. Au-delà, le
 * plus rigide des deux écrase l'autre, qui se fait tronquer — et un libellé
 * coupé rend deux lignes indiscernables. La règle du projet est d'élargir ou
 * de réagencer le conteneur, jamais de brider l'échelle : qui règle son
 * téléphone à 200 % en a besoin.
 */
export const stackAtFontScale = 1.5;
