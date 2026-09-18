import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useProfile } from '@/hooks/use-profile';
import { font, radius, useColors } from '@/theme/tokens';

/**
 * Accès aux paramètres du compte, en haut à droite des quatre onglets.
 *
 * Placé par chaque en-tête plutôt que par un en-tête commun géré par `Tabs` : les quatre écrans gèrent déjà leur zone sûre du haut chacun à sa façon (liste virtualisée pour l'historique, ScrollView pour les autres), et un en-tête de navigateur les aurait tous obligés à la céder.
 *
 * Rond, et non carré arrondi : le rond est réservé aux personnes dans l'app. L'initiale du nom affiché plutôt qu'une icône générique, pour qu'on reconnaisse son propre compte ; l'icône ne sert que tant que le profil charge.
 */
export function AccountButton() {
  const colors = useColors();
  const { profile } = useProfile();
  const initial = profile?.displayName.trim().charAt(0).toUpperCase();

  return (
    <Link href="/settings" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Paramètres du compte"
        hitSlop={8}
        // Aplati : <Link asChild> transmet le style par un Slot, qui lève une erreur de rendu en développement s'il reçoit un tableau.
        style={StyleSheet.flatten([styles.button, { backgroundColor: colors.primary }])}
      >
        {initial ? (
          <Text style={[styles.initial, { color: colors.primaryText }]}>{initial}</Text>
        ) : (
          <MaterialCommunityIcons name="account-outline" size={18} color={colors.primaryText} />
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  initial: {
    fontFamily: font.bold,
    fontSize: 15,
    lineHeight: 19,
  },
});
