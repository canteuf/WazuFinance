import { useNavigation } from 'expo-router';
import type { NativeStackNavigationProp } from 'expo-router/native-stack';
import type { ParamListBase } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

/** Espace laissé entre le champ et le haut du clavier, pour voir aussi son libellé d'erreur ou son indication. */
const MARGIN_ABOVE_KEYBOARD = 24;

/** Repli quand l'écran n'annonce pas la fin de son ouverture (un onglet n'a pas de transition) : au-delà, on considère qu'elle est finie. */
const TRANSITION_FALLBACK_MS = 600;

/**
 * Défilement qui garde le champ en cours de saisie au-dessus du clavier, pour les feuilles de formulaire comme pour les écrans (`Screen` s'en sert aussi). Ne jamais lui préférer un `ScrollView` nu là où l'on saisit.
 *
 * Une feuille (`formSheet`) ne se redimensionne pas à l'ouverture du clavier, et un écran non plus sur Android : l'affichage bord à bord, imposé depuis le SDK 54, désactive `adjustResize`. La note de la saisie, le mot de passe de « Supprimer mon compte » passaient sous le clavier.
 *
 * C'est le `KeyboardAwareScrollView` de react-native-keyboard-controller, la solution que recommande la documentation d'Expo. Trois versions maison l'ont précédé, qui mesuraient le champ et le clavier en JavaScript (`measureInWindow`, `endCoordinates`) ; aucune ne tenait sur Android : `endCoordinates.screenY` y ignore le clavier en bord à bord, et dans une feuille, react-native-screens remonte lui-même la feuille au-dessus du clavier sans en informer l'arbre de rendu. La bibliothèque lit la position du champ et suit le clavier côté natif. Elle trouve seule le champ qui a le focus, et un champ déjà visible ne provoque aucun défilement.
 *
 * Deux ajustements autour d'elle :
 * - **L'enveloppe `frame` s'étire en largeur.** Sur Android, la bibliothèque place le défilement dans une vue native (`ClippingScrollView`) qui ne reçoit pas le `style` passé ici ; dans une feuille, dont le fond centre ses blocs (`alignItems: 'center'`), elle se réduisait à la largeur de son contenu, et tout le formulaire rétrécissait — le champ du nom de groupe tenait en un tiers d'écran.
 * - **Le défilement automatique attend la fin de l'ouverture** (`transitionEnd`). Le montant prend le focus dès l'ouverture de la saisie, pendant que la feuille glisse encore depuis le bas : mesuré à mi-course, il paraissait sous le clavier, et tout le contenu remontait jusqu'à cacher le montant lui-même. Un champ ouvert d'office est en haut, donc visible sans aide.
 *
 * Module natif : absent d'Expo Go, il demande un development build (`eas build --profile development`). `KeyboardProvider`, à la racine (`src/app/_layout.tsx`), doit l'entourer.
 */
export function SheetScrollView({ enabled = true, ...props }: KeyboardAwareScrollViewProps) {
  const settled = useTransitionSettled();

  return (
    <View style={styles.frame}>
      <KeyboardAwareScrollView bottomOffset={MARGIN_ABOVE_KEYBOARD} enabled={enabled && settled} {...props} />
    </View>
  );
}

/** Vrai une fois l'écran ou la feuille qui contient ce composant arrivé à sa place. */
function useTransitionSettled(): boolean {
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

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'stretch',
    // Prend la hauteur restante dans un écran ; dans une feuille ajustée à son contenu, il n'y en a pas, et `flexShrink` laisse le `maxHeight` de la feuille borner le défilement.
    flexGrow: 1,
    flexShrink: 1,
  },
});
