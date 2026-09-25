import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  Keyboard,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/** Espace laissé entre le bas du champ et le haut du clavier, pour voir aussi son libellé d'erreur ou son indication. */
const MARGIN_ABOVE_KEYBOARD = 24;

/**
 * Défilement d'une feuille de formulaire qui garde le champ en cours de saisie au-dessus du clavier.
 *
 * Une feuille (`formSheet`) ne se redimensionne pas à l'ouverture du clavier : le clavier la recouvre. Le champ de la note, en bas de la saisie, disparaissait dessous pendant qu'on y tapait. Ce composant fait deux choses à l'ouverture du clavier :
 * 1. il ajoute sous le contenu un espace de la hauteur du clavier, pour que le bas du formulaire puisse remonter au-dessus — un espace plutôt qu'un `paddingBottom`, qui remplacerait celui que la feuille a déjà ;
 * 2. il fait défiler juste ce qu'il faut pour que le champ qui a le focus soit visible, en comparant sa position à l'écran avec le haut du clavier.
 *
 * Le champ est retrouvé par `TextInput.State.currentlyFocusedInput()` : aucun champ n'a besoin d'être câblé, et un champ ajouté plus tard au formulaire est couvert d'office. Aucun module natif : fonctionne dans Expo Go comme dans un build.
 *
 * Un champ déjà visible ne provoque aucun défilement : le montant, en haut de la saisie, ne bouge pas quand le clavier s'ouvre.
 *
 * Passer d'un champ à l'autre clavier ouvert ne déclenche pas toujours `keyboardDidShow` sur Android : la vérification est refaite après chaque toucher dans la feuille, tant que le clavier est ouvert.
 */
export function SheetScrollView({
  contentContainerStyle,
  children,
  ...props
}: ScrollViewProps & { contentContainerStyle?: StyleProp<ViewStyle> }) {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Copie lisible hors rendu : le rappel de toucher n'a pas à dépendre de l'état.
  const keyboard = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reveal() {
    const height = keyboard.current;
    const input = TextInput.State.currentlyFocusedInput();
    if (height === 0 || !input) {
      return;
    }
    input.measureInWindow((_x, y, _width, inputHeight) => {
      const keyboardTop = windowHeight - height;
      const overlap = y + inputHeight + MARGIN_ABOVE_KEYBOARD - keyboardTop;
      if (overlap > 0) {
        scrollRef.current?.scrollTo({ y: offset.current + overlap, animated: true });
      }
    });
  }

  function revealSoon(delay: number) {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    // Le champ ne se mesure juste qu'une fois l'espace posé et le focus établi : on attend le rendu suivant.
    timer.current = setTimeout(reveal, delay);
  }

  // Un évènement d'effet : il lit la hauteur d'écran courante sans que l'abonnement au clavier soit refait à chaque rotation.
  const onKeyboardChange = useEffectEvent((height: number) => {
    keyboard.current = height;
    setKeyboardHeight(height);
    if (height > 0) {
      revealSoon(50);
    }
  });

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) =>
      onKeyboardChange(event.endCoordinates.height)
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => onKeyboardChange(0));

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
      show.remove();
      hide.remove();
    };
  }, []);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    offset.current = event.nativeEvent.contentOffset.y;
    props.onScroll?.(event);
  }

  return (
    <ScrollView
      {...props}
      ref={scrollRef}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      contentContainerStyle={contentContainerStyle}
      onTouchEnd={(event) => {
        props.onTouchEnd?.(event);
        revealSoon(150);
      }}
    >
      {children}
      <View style={{ height: keyboardHeight }} />
    </ScrollView>
  );
}
