import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  SettingsDivider,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-section';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { dataErrorMessage } from '@/lib/data-errors';
import { validateDisplayName } from '@/lib/validation';
import { font, spacing, useColors } from '@/theme/tokens';

/** Durée d'affichage de « Enregistré », comme « Copié » à l'écran 7. */
const SAVED_NOTICE_MS = 2000;

export function ProfileSection() {
  const colors = useColors();
  const { session } = useAuth();
  const { profile, isLoading, error, rename, isRenaming } = useProfile();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
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
      <SettingsSection title="Profil & identité">
        {error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{dataErrorMessage(error)}</Text>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </SettingsSection>
    );
  }

  const validationError = validateDisplayName(draft);
  const changed = draft.trim() !== profile.displayName;

  // Le badge n'est posé que si Supabase Auth a réellement confirmé l'adresse : un « Vérifié » affiché par défaut mentirait sur un projet où la confirmation par email est désactivée.
  const verified = Boolean(session?.user.email_confirmed_at);

  function handleSave() {
    setSaveError(undefined);
    rename.mutate(draft, {
      onSuccess: () => {
        setEditing(false);
        setSaved(true);
      },
      onError: (mutationError) => setSaveError(dataErrorMessage(mutationError)),
    });
  }

  return (
    <SettingsSection title="Profil & identité" flush>
      <SettingsRow
        icon="card-account-details-outline"
        label="Nom d’affichage"
        value={profile.displayName}
        accessibilityLabel={`Nom d’affichage : ${profile.displayName}. Modifier`}
        trailing={saved ? <StatusBadge tone="ok" label="Enregistré" /> : undefined}
        onPress={() => {
          setDraft(profile.displayName);
          setSaveError(undefined);
          setEditing((open) => !open);
        }}
      />

      {editing ? (
        <View style={styles.editor}>
          <TextField
            label="Nouveau nom"
            value={draft}
            onChangeText={setDraft}
            errorText={(changed ? validationError : undefined) ?? saveError}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            autoFocus
          />
          <View style={styles.actions}>
            <Button
              title="Enregistrer"
              loading={isRenaming}
              // Actif seulement sur une vraie modification valide : enregistrer la même valeur ne ferait qu'un aller-retour inutile.
              disabled={!changed || validationError !== undefined}
              onPress={handleSave}
            />
            <Button title="Annuler" variant="ghost" onPress={() => setEditing(false)} />
          </View>
        </View>
      ) : null}

      <SettingsDivider />

      {/* Pas de chevron : changer d'email passe par un lien de confirmation qui doit rouvrir l'app, et aucune infrastructure de lien profond n'existe encore. Une rangée sans action ne promet rien. */}
      <SettingsRow
        icon="email-outline"
        label="Adresse e-mail"
        value={profile.email}
        plainValue
        trailing={verified ? <StatusBadge tone="ok" label="Vérifié" /> : undefined}
      />
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  editor: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  actions: {
    gap: spacing.xs,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 14,
  },
});
