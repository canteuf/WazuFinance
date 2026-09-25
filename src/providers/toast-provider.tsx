import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONTENT_GUTTER } from '@/components/ui/screen';
import { font, radius, spacing, useColors } from '@/theme/tokens';

export type ToastTone = 'success' | 'info' | 'error';

export type ToastApi = {
  /** Affiche un message bref en bas de l'écran, l'annonce au lecteur d'écran, et fait vibrer pour un succès ou une erreur. */
  show: (message: string, tone?: ToastTone) => void;
};

export const ToastContext = createContext<ToastApi | null>(null);

/** Assez pour lire une phrase courte deux fois, pas assez pour gêner la saisie suivante. */
const VISIBLE_MS = 2800;
const FADE_MS = 180;

/**
 * Message de confirmation après une action dont l'écran se ferme.
 *
 * La feuille de saisie se ferme dès l'enregistrement : sans ce message, rien ne disait que la dépense avait bien été prise, et l'on rouvrait la liste pour vérifier. Il vit donc au-dessus de la pile, pas dans la feuille, pour survivre à sa fermeture.
 *
 * Un seul message à la fois : le suivant remplace le précédent, deux saisies rapides ne s'empilent pas.
 *
 * Pas d'interaction (ni « Annuler », ni fermeture au toucher) : `pointerEvents="none"`, pour qu'il ne masque jamais le bouton flottant de saisie qu'il recouvre en partie.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; tone: ToastTone; key: number } | null>(
    null
  );
  // Créée une fois et gardée dans un état : le React Compiler refuse la lecture d'une ref pendant le rendu, et l'animation n'a pas besoin de provoquer de rendu.
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  const show = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
      setToast({ message, tone, key: Date.now() });
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(
          ({ finished }) => {
            if (finished) {
              setToast(null);
            }
          }
        );
      }, VISIBLE_MS);

      // Le message visuel ne suffit pas : il apparaît loin du dernier élément touché, et un lecteur d'écran ne le lirait pas de lui-même.
      AccessibilityInfo.announceForAccessibility(message);
      if (tone !== 'info' && Platform.OS !== 'web') {
        // La vibration ne conditionne rien : un appareil sans moteur de vibration, ou un build sans le module, ne doit pas faire échouer la saisie.
        Haptics.notificationAsync(
          tone === 'error'
            ? Haptics.NotificationFeedbackType.Error
            : Haptics.NotificationFeedbackType.Success
        ).catch(() => undefined);
      }
    },
    [opacity]
  );

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <View
          pointerEvents="none"
          // Au-dessus de la barre d'onglets (60) et du bouton flottant qui la surplombe.
          style={[styles.layer, { bottom: insets.bottom + 132 }]}
        >
          <Animated.View
            key={toast.key}
            // L'annonce passe par announceForAccessibility : le bandeau lui-même est retiré de l'arbre d'accessibilité, sinon il serait lu deux fois.
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[styles.toast, { backgroundColor: colors.text, opacity }]}
          >
            <MaterialCommunityIcons
              name={
                toast.tone === 'success'
                  ? 'check-circle'
                  : toast.tone === 'error'
                    ? 'alert-circle'
                    : 'cloud-upload-outline'
              }
              size={20}
              color={colors.background}
            />
            <Text style={[styles.message, { color: colors.background }]}>{toast.message}</Text>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: CONTENT_GUTTER,
  },
  toast: {
    width: '100%',
    // Même largeur que les cartes des écrans sur une tablette, plutôt qu'un bandeau d'un bord à l'autre.
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  message: {
    flex: 1,
    fontFamily: font.semibold,
    fontSize: 16,
    lineHeight: 21,
  },
});
