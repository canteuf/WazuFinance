import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { CONTENT_GUTTER, CONTENT_MAX_WIDTH } from '@/components/ui/screen';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/**
 * Le titre d'en-tête, exporté pour le tableau de bord : son titre est un bouton (le groupe actif, qui ouvre la liste des groupes), donc il ne passe pas par la prop `title` mais doit porter exactement la même police.
 */
export const headerTitleStyle: TextStyle = {
  fontFamily: font.black,
  fontSize: 24,
  letterSpacing: -0.6,
};

/**
 * En-tête commun à tous les écrans : un retour optionnel, un titre, un sous-titre optionnel, puis les actions de l'écran alignées à droite.
 *
 * Chaque écran écrivait le sien : le titre allait de 24 à 30 points selon l'écran, le bouton de retour était tantôt une pastille, tantôt une flèche nue, et les marges ne tombaient pas au même endroit. Passer d'un onglet à un écran empilé décalait donc la ligne de titre sous les yeux. Une seule implémentation évite d'avoir à les tenir d'accord à la main.
 *
 * Il porte lui-même ses marges et sa largeur maximale, au lieu de les recevoir de `Screen` : l'historique, le journal et les autres listes virtualisées le rendent hors de tout `ScrollView` (voir `Screen`), et doivent obtenir exactement la même bande sans la recopier.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Retour',
  children,
}: {
  /** Une chaîne prend le style de titre commun ; un nœud (la pastille de groupe du tableau de bord) est rendu tel quel, à la place du titre. */
  title: ReactNode;
  subtitle?: string;
  /** Absent sur les destinations d'onglet : il n'y a rien derrière elles. */
  onBack?: () => void;
  backLabel?: string;
  /** Actions de l'écran (bouton de compte, liens, pastille de comptage), calées à droite. */
  children?: ReactNode;
}) {
  const colors = useColors();

  return (
    <View style={styles.bar}>
      <View style={styles.inner}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            hitSlop={spacing.sm}
            onPress={onBack}
            style={[styles.back, { backgroundColor: colors.surfaceMuted }]}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
          </Pressable>
        ) : null}

        <View style={styles.titleBlock}>
          {typeof title === 'string' ? (
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            title
          )}
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {children ? <View style={styles.actions}>{children}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: CONTENT_GUTTER,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  inner: {
    // Mêmes bornes que le contenu de `Screen` : sur un écran large, un en-tête calé sur les bords ne serait plus aligné avec les cartes qu'il surplombe.
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    // À fort grossissement de police, les actions passent sous le titre plutôt que de sortir de l'écran.
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  back: {
    // Même diamètre que `AccountButton` : les deux pastilles se font face dans la même bande.
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleBlock: {
    // Prend la place restante : les actions sont ainsi poussées au bord droit sans marge automatique.
    flex: 1,
    flexShrink: 1,
    gap: 2,
  },
  title: headerTitleStyle,
  subtitle: {
    fontFamily: font.regular,
    fontSize: 14.5,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 0,
  },
});
