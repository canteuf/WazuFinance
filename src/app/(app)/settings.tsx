import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DeleteAccountSection } from '@/components/settings/delete-account-section';
import { PasswordSection } from '@/components/settings/password-section';
import { PeriodSection } from '@/components/settings/period-section';
import { ProfileSection } from '@/components/settings/profile-section';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/hooks/use-auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { goBackOr } from '@/lib/navigation';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Paramètres du compte (écran 8). Voir docs/superpowers/specs/2026-09-13-parametres-compte-design.md.
 *
 * Chaque section porte ses propres états de chargement et d'erreur : une section en échec n'emporte pas les autres, même principe que les cartes du tableau de bord.
 *
 * La suppression vient en dernier, séparée de la déconnexion : les deux quittent l'app, mais l'une est définitive, et les juxtaposer invitait au mauvais geste.
 */
export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { signOut } = useAuth();
  const [signOutError, setSignOutError] = useState<string>();

  return (
    <Screen align="top">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={spacing.sm}
          onPress={() => goBackOr(router, '/')}
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.textMuted} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Paramètres</Text>
      </View>

      <ProfileSection />
      <PeriodSection />
      <PasswordSection />

      <View style={styles.signOut}>
        {signOutError ? (
          <Text style={[styles.error, { color: colors.danger }]}>{signOutError}</Text>
        ) : null}
        {/* Aucune navigation après la déconnexion : Stack.Protected bascule seul sur la connexion. */}
        <Button
          title="Se déconnecter"
          variant="ghost"
          onPress={() => {
            setSignOutError(undefined);
            signOut().catch((error: unknown) => setSignOutError(authErrorMessage(error)));
          }}
        />
      </View>

      <DeleteAccountSection />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  signOut: {
    gap: spacing.xs,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 13,
  },
});
