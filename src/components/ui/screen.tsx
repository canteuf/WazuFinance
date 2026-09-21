import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing, useColors } from '@/theme/tokens';

/**
 * Largeur utile d'un écran, gouttières exclues, et gouttière elle-même.
 *
 * Exportées parce que trois rendus doivent tomber sur la même colonne : le contenu d'un `Screen`, l'en-tête (`ScreenHeader`, qui vit hors du ScrollView) et les listes virtualisées de l'historique et du journal, qui n'utilisent pas `Screen` du tout. Chacun les appliquait de son côté ; les listes avaient bien la gouttière mais pas la borne, et leurs cartes s'étiraient au-delà du titre dès que l'écran dépassait 468 points.
 *
 * Une liste borne son `contentContainerStyle` à `CONTENT_MAX_WIDTH + CONTENT_GUTTER * 2`, la gouttière étant à l'intérieur du conteneur et non autour.
 */
// 560 et non 420 : la borne est là pour qu'une carte ne s'étire pas sur toute la largeur d'une tablette, où une ligne de plus de soixante-dix caractères se relit mal. À 420 elle rattrapait déjà des téléphones — un Galaxy S21 Ultra fait 480 points — et les centrait avec trente points de marge de chaque côté, ce que rien ne justifie sur un téléphone. Aucun téléphone n'atteint 560 ; une tablette, si.
export const CONTENT_MAX_WIDTH = 560;
// 12 plutôt que 24 : les marges d'origine laissaient deux fois plus de blanc sur les bords que les applications de référence (WhatsApp est à douze points sur ses listes), et le contenu paraissait flotter au milieu de l'écran. Valeur littérale et non un jeton `spacing` : l'échelle progresse de 8 à 16 sans passer par 12, et l'y insérer pour ce seul usage romprait sa régularité — c'est une mesure de gouttière, pas un pas d'espacement.
export const CONTENT_GUTTER = 12;

/**
 * La colonne, gouttières comprises, pour les blocs qui portent eux-mêmes leur gouttière : le `contentContainerStyle` d'une liste virtualisée, et les blocs d'une feuille de formulaire, dont le fond doit rester pleine largeur pendant que le contenu se centre.
 */
export const contentColumn = {
  width: '100%',
  maxWidth: CONTENT_MAX_WIDTH + CONTENT_GUTTER * 2,
  alignSelf: 'center',
  // `as const` plutôt qu'une annotation `ViewStyle` : les trois propriétés valent aussi pour un `Text` (le message d'erreur d'export en est un), et un `ViewStyle` élargi y serait refusé.
} as const satisfies ViewStyle;

/**
 * Conteneur d'écran : zones sûres, fond thématisé et remontée du contenu quand le clavier iOS s'ouvre — indispensable sur les formulaires d'auth.
 *
 * `floatingAction` (le bouton + du dashboard) est rendu hors du ScrollView et épinglé en bas à droite : le contenu défile sous lui, mais lui ne défile jamais. Un bouton placé dans le flux du ScrollView descendrait avec une liste qui s'allonge et finirait hors de portée sans faire défiler — ce que la saisie en 3 tapotements ne permet pas.
 *
 * `header` suit la même logique, en haut : il est rendu au-dessus du ScrollView, jamais dedans, donc il ne défile pas.
 *
 * `align` décide du sort de la place restante quand le contenu est plus court que l'écran. « center » convient à un formulaire court, qu'on veut au milieu du regard ; « top » à un écran qui se lit de haut en bas, où centrer creuse un vide au-dessus du titre et repousse l'information principale vers le milieu de l'écran.
 */
export function Screen({
  children,
  header,
  floatingAction,
  align = 'center',
  inTabs = false,
  floatingAlign = 'end',
}: {
  children: ReactNode;
  /**
   * En-tête de l'écran, un `ScreenHeader` : rendu hors du ScrollView, comme la liste de l'historique le fait depuis toujours, il reste à sa place pendant que le contenu défile dessous. Placé dans le flux du ScrollView, il disparaissait vers le haut et emportait avec lui l'accès au compte et aux actions de l'écran.
   *
   * Il porte ses propres marges plutôt que d'en recevoir ici : les écrans à liste virtualisée le rendent sans passer par `Screen`, et doivent obtenir la même bande.
   */
  header?: ReactNode;
  floatingAction?: ReactNode;
  align?: 'center' | 'top';
  /**
   * Vrai pour les quatre écrans d'onglet. La barre d'onglets occupe déjà le bas de l'écran et gère sa propre zone sûre : lui ajouter celle du Screen creuserait une bande vide au-dessus d'elle, et un bouton flottant calé sur le bas passerait derrière.
   */
  inTabs?: boolean;
  /** « center » pour la pilule « + Saisie » des maquettes, « end » pour le bouton rond calé à droite. */
  floatingAlign?: 'end' | 'center';
}) {
  const colors = useColors();

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={inTabs ? ['top'] : ['top', 'bottom']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {header}
        <ScrollView
          contentContainerStyle={[
            styles.content,
            align === 'center' ? styles.contentCentered : null,
            header ? styles.contentWithHeader : null,
            floatingAction ? styles.contentWithFloating : null,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.inner}>{children}</View>
        </ScrollView>
        {floatingAction ? (
          <View
            style={[
              styles.floating,
              inTabs ? styles.floatingInTabs : null,
              floatingAlign === 'center' ? styles.floatingCenter : null,
            ]}
            // Centré, le conteneur couvre toute la largeur : sans ceci, il intercepterait les touchers destinés au contenu de part et d'autre de la pilule.
            pointerEvents="box-none"
          >
            {floatingAction}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    // flexGrow, et non flex : le contenu garde sa hauteur naturelle dès qu'il dépasse l'écran, et ne remplit la place restante que s'il en reste.
    flexGrow: 1,
    paddingHorizontal: CONTENT_GUTTER,
    paddingVertical: spacing.lg,
  },
  contentCentered: {
    justifyContent: 'center',
  },
  // L'en-tête porte déjà l'espace au-dessus du contenu ; le garder ici ouvrirait un blanc entre les deux.
  contentWithHeader: {
    paddingTop: 0,
  },
  // Espace sous le contenu pour que le dernier élément (ex. « Se déconnecter ») ne se retrouve pas masqué derrière le bouton flottant (56px + sa marge).
  contentWithFloating: {
    paddingBottom: spacing.xl * 3,
  },
  inner: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    // Rythme entre les blocs d'un écran. spacing.md serrait les blocs les uns contre les autres une fois l'écran aligné en haut : la hiérarchie ne se lisait plus, tout se touchait.
    gap: spacing.lg,
  },
  floating: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
  },
  floatingCenter: {
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  floatingInTabs: {
    // Dégage la barre d'onglets, qui couvre le bas de l'écran.
    bottom: spacing.md,
  },
});
