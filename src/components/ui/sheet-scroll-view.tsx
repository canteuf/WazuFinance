import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  View,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Espace laissé entre le bas du champ et le haut du clavier, pour voir aussi son libellé d'erreur ou son indication. */
const MARGIN_ABOVE_KEYBOARD = 24;

/**
 * Défilement qui garde le champ en cours de saisie au-dessus du clavier, pour les feuilles de formulaire comme pour les écrans (`Screen` s'en sert aussi).
 *
 * Une feuille (`formSheet`) ne se redimensionne pas à l'ouverture du clavier : le clavier la recouvre. Le champ de la note, en bas de la saisie, disparaissait dessous pendant qu'on y tapait. Un écran ordinaire non plus, sur Android : l'affichage bord à bord, imposé depuis le SDK 54, désactive `adjustResize`, et un `KeyboardAvoidingView` sans `behavior` n'y fait rien — les champs du bas de l'inscription et des paramètres passaient sous le clavier. Ce composant fait deux choses à l'ouverture du clavier :
 * 1. il ajoute sous le contenu un espace de la hauteur que le clavier masque, pour que le bas du formulaire puisse remonter au-dessus — un espace plutôt qu'un `paddingBottom`, qui remplacerait celui que le conteneur a déjà ;
 * 2. il fait défiler juste ce qu'il faut pour que le champ qui a le focus soit visible, en comparant sa position à l'écran avec le haut du clavier.
 *
 * Le champ est retrouvé par `TextInput.State.currentlyFocusedInput()` : aucun champ n'a besoin d'être câblé, et un champ ajouté plus tard au formulaire est couvert d'office. Aucun module natif : fonctionne dans Expo Go comme dans un build.
 *
 * Où commence le clavier, voir `keyboardTopOf()` : sur Android, ni `screenY` ni la hauteur de la fenêtre ne le disent.
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
  const { bottom: bottomInset } = useSafeAreaInsets();
  const [spacer, setSpacer] = useState(0);
  // Position du haut du clavier à l'écran, `null` clavier fermé. Lue hors rendu : le rappel de toucher n'a pas à dépendre de l'état.
  const keyboardTop = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reveal() {
    const top = keyboardTop.current;
    const input = TextInput.State.currentlyFocusedInput();
    if (top === null || !input) {
      return;
    }
    input.measureInWindow((_x, y, _width, inputHeight) => {
      const overlap = y + inputHeight + MARGIN_ABOVE_KEYBOARD - top;
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

  // Un évènement d'effet : `revealSoon` change à chaque rendu, l'abonnement au clavier n'a pas à être refait pour autant.
  const onKeyboardChange = useEffectEvent((event: KeyboardEvent | null) => {
    if (!event) {
      keyboardTop.current = null;
      setSpacer(0);
      return;
    }
    const screenHeight = Dimensions.get('screen').height;
    const top = keyboardTopOf(event, screenHeight, bottomInset);
    keyboardTop.current = top;
    // Tout ce qui est sous le haut du clavier, barre de navigation comprise, plus la marge : trop d'espace ne se voit pas, trop peu laisse le dernier champ dessous.
    setSpacer(Math.max(0, screenHeight - top) + MARGIN_ABOVE_KEYBOARD);
    revealSoon(50);
  });

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => onKeyboardChange(event));
    const hide = Keyboard.addListener('keyboardDidHide', () => onKeyboardChange(null));

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
      // L'espace sous le contenu, ou le champ lui-même (« Supprimer mon compte » le fait apparaître avec le clavier), peut se poser après la première vérification : un défilement demandé plus tôt bute alors sur l'ancienne hauteur. On revérifie donc à chaque changement de hauteur tant que le clavier est ouvert.
      onContentSizeChange={(width, height) => {
        props.onContentSizeChange?.(width, height);
        if (keyboardTop.current !== null) {
          revealSoon(50);
        }
      }}
      onTouchEnd={(event) => {
        props.onTouchEnd?.(event);
        revealSoon(150);
      }}
    >
      {children}
      <View style={{ height: spacer }} />
    </ScrollView>
  );
}

/**
 * Position du haut du clavier, dans le repère de `measureInWindow`.
 *
 * Sur iOS, `endCoordinates.screenY` la donne telle quelle.
 *
 * Sur Android, il ne faut pas s'y fier. React Native (ReactRootView.checkForKeyboardEvents) la tire de `getWindowVisibleDisplayFrame()`, qui, en affichage bord à bord — imposé depuis le SDK 54 —, ne retire pas le clavier : `screenY` tombait au bas de l'écran, chaque champ y paraissait visible, et rien ne défilait (le mot de passe de « Supprimer mon compte » restait sous le clavier). La hauteur de la fenêtre ne vaut pas mieux : elle exclut la barre de navigation, ou non, selon l'appareil. Restent trois mesures sûres : la hauteur physique de l'écran (`Dimensions` « screen », que la vue racine bord à bord occupe entière), `endCoordinates.height` — le clavier moins la barre de navigation, que React Native retranche lui-même — et cette barre, qui est la marge basse de la zone sûre.
 */
function keyboardTopOf(event: KeyboardEvent, screenHeight: number, bottomInset: number): number {
  const { screenY, height } = event.endCoordinates;
  if (Platform.OS === 'ios') {
    return screenY > 0 ? screenY : screenHeight - height;
  }
  return screenHeight - height - bottomInset;
}
