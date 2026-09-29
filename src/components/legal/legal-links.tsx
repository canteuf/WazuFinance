import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { LEGAL_URLS } from '@/lib/legal';
import { font, spacing, useColors } from '@/theme/tokens';

const LINKS = [
  { url: LEGAL_URLS.terms, label: 'Conditions d’utilisation' },
  { url: LEGAL_URLS.privacy, label: 'Politique de confidentialité' },
] as const;

/**
 * Les deux textes à lire avant d'accepter, ouverts dans le navigateur du téléphone.
 *
 * `Linking.openURL` plutôt qu'un navigateur intégré : expo-web-browser est un module natif absent des builds, et l'ajouter demanderait un nouvel APK pour deux liens.
 *
 * Des boutons séparés plutôt que des liens dans la phrase de la case à cocher : un texte pressable à l'intérieur d'une rangée pressable ne se distingue pas au toucher, ni pour TalkBack.
 */
export function LegalLinks() {
  const colors = useColors();

  return (
    <View style={styles.links}>
      {LINKS.map((link) => (
        <Pressable
          key={link.url}
          accessibilityRole="link"
          accessibilityHint="S’ouvre dans le navigateur"
          onPress={() => void Linking.openURL(link.url)}
          hitSlop={8}
          style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}
        >
          <MaterialCommunityIcons name="open-in-new" size={16} color={colors.primary} />
          <Text style={[styles.label, { color: colors.primary }]}>{link.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  links: {
    gap: spacing.xs,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 16,
    textDecorationLine: 'underline',
  },
});
