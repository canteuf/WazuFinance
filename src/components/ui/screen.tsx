import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing, useColors } from '@/theme/tokens';

/**
 * Conteneur d'écran : zones sûres, fond thématisé et remontée du contenu quand le clavier iOS s'ouvre — indispensable sur les formulaires d'auth.
 *
 * `floatingAction` (le bouton + du dashboard) est rendu hors du ScrollView et épinglé en bas à droite : le contenu défile sous lui, mais lui ne défile jamais. Un bouton placé dans le flux du ScrollView descendrait avec une liste qui s'allonge et finirait hors de portée sans faire défiler — ce que la saisie en 3 tapotements ne permet pas.
 *
 * `align` décide du sort de la place restante quand le contenu est plus court que l'écran. « center » convient à un formulaire court, qu'on veut au milieu du regard ; « top » à un écran qui se lit de haut en bas, où centrer creuse un vide au-dessus du titre et repousse l'information principale vers le milieu de l'écran.
 */
export function Screen({
  children,
  floatingAction,
  align = 'center',
  inTabs = false,
  floatingAlign = 'end',
}: {
  children: ReactNode;
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
        <ScrollView
          contentContainerStyle={[
            styles.content,
            align === 'center' ? styles.contentCentered : null,
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
    padding: spacing.lg,
  },
  contentCentered: {
    justifyContent: 'center',
  },
  // Espace sous le contenu pour que le dernier élément (ex. « Se déconnecter ») ne se retrouve pas masqué derrière le bouton flottant (56px + sa marge).
  contentWithFloating: {
    paddingBottom: spacing.xl * 3,
  },
  inner: {
    width: '100%',
    maxWidth: 420,
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
