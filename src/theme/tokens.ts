import { useColorScheme } from 'react-native';

/**
 * Jetons de design partagés. Volontairement minimal pour la première passe :
 * il grandira avec les écrans 2 à 8.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
} as const;

export type Colors = {
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  danger: string;
};

const palette: Record<'light' | 'dark', Colors> = {
  light: {
    background: '#F7F8FA',
    surface: '#FFFFFF',
    border: '#DFE3EA',
    text: '#111827',
    textMuted: '#6B7280',
    primary: '#137A5F',
    primaryText: '#FFFFFF',
    danger: '#B42318',
  },
  dark: {
    background: '#0E1116',
    surface: '#171B22',
    border: '#2A303B',
    text: '#F3F4F6',
    textMuted: '#9BA3AF',
    primary: '#2DBE95',
    primaryText: '#05231B',
    danger: '#F97066',
  },
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}
