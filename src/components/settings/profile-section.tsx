import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SettingsSection } from '@/components/settings/settings-section';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useProfile } from '@/hooks/use-profile';
import { dataErrorMessage } from '@/lib/data-errors';
import { validateDisplayName } from '@/lib/validation';
import { font, useColors } from '@/theme/tokens';

/** Durée d'affichage de « Enregistré », comme « Copié » à l'écran 7. */
const SAVED_NOTICE_MS = 2000;

export function ProfileSection() {
  const colors = useColors();
  const { profile, isLoading, error, rename, isRenaming } = useProfile();

  // `null` tant que l'utilisateur n'a rien tapé : le champ suit alors la valeur en base, y compris quand elle arrive après le premier rendu.
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  useEffect(() => {
    if (!saved) {
      return;
    }
    const timer = setTimeout(() => setSaved(false), SAVED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  if (isLoading || !profile) {
    return (
      <SettingsSection title="Profil">
        {error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </SettingsSection>
    );
  }

  const value = draft ?? profile.displayName;
  const validationError = draft === null ? undefined : validateDisplayName(value);
  const changed = value.trim() !== profile.displayName;

  function handleSave() {
    setSaveError(undefined);
    rename.mutate(value, {
      onSuccess: () => {
        setDraft(null);
        setSaved(true);
      },
      onError: (mutationError) => setSaveError(dataErrorMessage(mutationError)),
    });
  }

  return (
    <SettingsSection title="Profil">
      <TextField
        label="Nom affiché"
        value={value}
        onChangeText={(text) => {
          setDraft(text);
          setSaved(false);
        }}
        errorText={validationError ?? saveError}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
      />
      <Button
        title={saved ? 'Enregistré' : 'Enregistrer'}
        loading={isRenaming}
        // Actif seulement sur une vraie modification valide : enregistrer la même valeur ne ferait qu'un aller-retour inutile.
        disabled={!changed || validationError !== undefined}
        onPress={handleSave}
      />

      <View style={styles.email}>
        <Text style={[styles.emailLabel, { color: colors.textMuted }]}>Adresse email</Text>
        <Text style={[styles.emailValue, { color: colors.text }]} selectable>
          {profile.email}
        </Text>
        {/* Changer d'email passe par un lien de confirmation qui doit rouvrir l'app : aucune infrastructure de lien profond n'existe encore. */}
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          L’email ne peut pas être modifié pour l’instant.
        </Text>
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  email: {
    gap: 2,
  },
  emailLabel: {
    fontFamily: font.semibold,
    fontSize: 12,
  },
  emailValue: {
    fontFamily: font.medium,
    fontSize: 15,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 12,
    marginTop: 2,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 14,
  },
});
