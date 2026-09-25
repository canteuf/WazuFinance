import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { DeleteAccountSection } from '@/components/settings/delete-account-section';
import { PreferencesSection } from '@/components/settings/preferences-section';
import { ProfileSection } from '@/components/settings/profile-section';
import { SecuritySection } from '@/components/settings/security-section';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useActiveGroup } from '@/hooks/use-active-group';
import { goBackOr } from '@/lib/navigation';
import { font, useColors } from '@/theme/tokens';

/**
 * Paramètres du compte (écran 8), d'après la maquette Stitch `param_tres_du_compte_wazu_finance`. Voir aussi docs/superpowers/specs/2026-09-13-parametres-compte-design.md.
 *
 * Écarts assumés avec la maquette : le choix de thème a une troisième option, « Système », qui reste le défaut ; le changement de mot de passe est gardé ; la suppression passe par une confirmation. Les mentions « Espace sécurisé », « Certifié WCAG AA » et « Données chiffrées localement » sont retirées : aucune n'est vraie ou vérifiée, et un écran de sécurité est le dernier endroit où affirmer ce qu'on ne garantit pas.
 *
 * Chaque section porte ses propres états de chargement et d'erreur : une section en échec n'emporte pas les autres.
 */
export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { activeGroup } = useActiveGroup();

  const version = Constants.expoConfig?.version;

  return (
    <Screen
      align="top"
      header={
        <ScreenHeader
          title="Paramètres du compte"
          subtitle={`Profil · Préférences · ${activeGroup?.name ?? 'Compte personnel'}`}
          onBack={() => goBackOr(router, '/')}
        />
      }
    >
      <ProfileSection />
      <PreferencesSection />
      <SecuritySection />
      <DeleteAccountSection />

      {version ? (
        <Text style={[styles.footer, { color: colors.textMuted }]}>Wazu Finance v{version}</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: {
    fontFamily: font.regular,
    fontSize: 14,
    textAlign: 'center',
  },
});
