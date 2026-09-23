import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { MemberAvatar } from '@/components/ui/member-avatar';
import { useProfile } from '@/hooks/use-profile';
import { parseAvatarId } from '@/lib/avatars';
import { font, radius, useColors } from '@/theme/tokens';

/**
 * Accès aux paramètres du compte, en haut à droite des quatre onglets.
 *
 * Placé par chaque en-tête plutôt que par un en-tête commun géré par `Tabs` : les quatre écrans gèrent déjà leur zone sûre du haut chacun à sa façon (liste virtualisée pour l'historique, ScrollView pour les autres), et un en-tête de navigateur les aurait tous obligés à la céder.
 *
 * Rond, et non carré arrondi : le rond est réservé aux personnes dans l'app. L'avatar choisi s'il y en a un, sinon l'initiale du nom affiché plutôt qu'une icône générique, pour qu'on reconnaisse son propre compte ; l'icône ne sert que tant que le profil charge.
 */
export function AccountButton() {
  const colors = useColors();
  const { profile } = useProfile();
  const initial = profile?.displayName.trim().charAt(0).toUpperCase();
  const avatar = parseAvatarId(profile?.avatar);

  return (
    <Link href="/settings" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Paramètres du compte"
        hitSlop={8}
        // Aplati : <Link asChild> transmet le style par un Slot, qui lève une erreur de rendu en développement s'il reçoit un tableau. Sans fond quand un avatar est choisi : la pastille de MemberAvatar dessine son propre rond.
        style={StyleSheet.flatten([styles.button, avatar ? null : { backgroundColor: colors.primary }])}
      >
        {profile && avatar ? (
          <MemberAvatar name={profile.displayName} avatar={avatar} size={BUTTON_SIZE} />
        ) : initial ? (
          <Text style={[styles.initial, { color: colors.primaryText }]}>{initial}</Text>
        ) : (
          <MaterialCommunityIcons name="account-outline" size={22} color={colors.primaryText} />
        )}
      </Pressable>
    </Link>
  );
}

/** Même diamètre que le bouton de retour des en-têtes : les deux occupent le même coin selon l'écran, et deux pastilles de tailles différentes au même endroit se remarquaient en passant d'un écran à l'autre. */
const BUTTON_SIZE = 42;

const styles = StyleSheet.create({
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  initial: {
    fontFamily: font.bold,
    fontSize: 20,
    lineHeight: 25,
  },
});
