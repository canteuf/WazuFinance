import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { StyleSheet, Text } from 'react-native';

import { AppLockSection } from '@/components/settings/app-lock-section';
import { DataSection } from '@/components/settings/data-section';
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
  const update = describeRunningUpdate();

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
      <AppLockSection />
      <SecuritySection />
      <DataSection />
      <DeleteAccountSection />

      {version ? (
        <Text style={[styles.footer, { color: colors.textMuted }]}>
          Wazu Finance v{version}
          {update ? ` · ${update}` : ''}
        </Text>
      ) : null}
    </Screen>
  );
}

/**
 * Ce que le téléphone exécute vraiment : le code livré avec l'APK, ou une mise à jour EAS et sa date. Sans cette ligne, impossible de savoir si une mise à jour publiée est déjà appliquée — elle ne l'est qu'au lancement qui suit son téléchargement.
 *
 * `null` en développement, où expo-updates est désactivé.
 */
function describeRunningUpdate(): string | null {
  if (!Updates.isEnabled) {
    return null;
  }
  if (Updates.isEmbeddedLaunch || !Updates.createdAt) {
    return 'version d’origine';
  }
  const date = Updates.createdAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const time = Updates.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `mise à jour du ${date} à ${time}`;
}

const styles = StyleSheet.create({
  footer: {
    fontFamily: font.regular,
    fontSize: 14,
    textAlign: 'center',
  },
});
