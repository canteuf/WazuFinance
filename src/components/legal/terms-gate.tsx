import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LegalLinks } from '@/components/legal/legal-links';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useIsOnline } from '@/hooks/use-offline-status';
import { authErrorMessage } from '@/lib/auth-errors';
import { hasAcceptedCurrentTerms } from '@/lib/legal';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Demande d'accepter les CGU et la politique en vigueur à un compte qui ne l'a pas encore fait : un compte créé avant leur publication, ou après un changement des textes (`TERMS_VERSION`). Une inscription les accepte déjà par sa case à cocher.
 *
 * Un `Modal` RN, comme le verrou et pour la même raison : un `formSheet` est présenté au-dessus de la pile et resterait visible par-dessus une vue ordinaire. Le verrou, monté après, reste au-dessus de cet écran.
 *
 * Seulement en ligne : l'acceptation s'enregistre sur le compte, donc demande le réseau, et bloquer l'app hors connexion empêcherait de noter une dépense sans rien pouvoir y faire. L'écran vient à la première ouverture connectée.
 */
export function TermsGate() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session, acceptTerms, signOut } = useAuth();
  const online = useIsOnline();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const visible = session !== null && online && !hasAcceptedCurrentTerms(session.user.user_metadata);

  async function handleAccept() {
    setSubmitting(true);
    setError(undefined);
    try {
      await acceptTerms();
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    setError(undefined);
    try {
      await signOut();
    } catch (caught) {
      setError(authErrorMessage(caught));
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      // Retour Android : l'écran ne se ferme qu'en acceptant ou en se déconnectant.
      onRequestClose={() => undefined}
    >
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          Nos conditions d’utilisation
        </Text>
        <Text style={[styles.body, { color: colors.text }]}>
          Wazu Finance publie ses conditions d’utilisation et sa politique de confidentialité. Elles disent quelles données l’application garde, qui peut les voir, combien de temps, et comment les supprimer.
        </Text>
        <Text style={[styles.body, { color: colors.text }]}>
          Pour continuer, lisez-les, puis confirmez que vous avez 18 ans ou plus et que vous les acceptez.
        </Text>

        <LegalLinks />

        {error ? (
          <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            title="J’ai 18 ans ou plus et j’accepte"
            loading={submitting}
            onPress={() => void handleAccept()}
          />
          <Button title="Me déconnecter" variant="ghost" onPress={() => void handleSignOut()} />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontFamily: font.black,
    fontSize: 26,
    letterSpacing: -0.5,
  },
  body: {
    fontFamily: font.regular,
    fontSize: 17,
    lineHeight: 24,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 16,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
