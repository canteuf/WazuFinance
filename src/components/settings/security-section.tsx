import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  SettingsDivider,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-section';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/hooks/use-auth';
import { authErrorMessage, CurrentPasswordError } from '@/lib/auth-errors';
import { validatePassword } from '@/lib/validation';
import { font, spacing, useColors } from '@/theme/tokens';

type Errors = {
  current?: string;
  next?: string;
  confirm?: string;
  form?: string;
};

/**
 * Mot de passe et déconnexion.
 *
 * Le changement de mot de passe est absent de la maquette Stitch mais gardé : sans lui, l'app n'offre aucun moyen de le changer. Il prend la forme des autres rangées, et son formulaire se déplie dessous — un geste rare ne mérite pas trois champs ouverts en permanence.
 *
 * Pas de `useMutation` : comme la connexion et l'inscription, les deux actions passent par `useAuth()` avec un état local de chargement et d'erreur.
 */
export function SecuritySection() {
  const colors = useColors();
  const { changePassword, signOut } = useAuth();

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();

  function close() {
    setCurrent('');
    setNext('');
    setConfirm('');
    setErrors({});
    setOpen(false);
  }

  async function handleSubmit() {
    const found: Errors = {
      current: current ? undefined : 'Mot de passe actuel requis.',
      next: validatePassword(next),
      confirm: confirm === next ? undefined : 'Les deux mots de passe ne correspondent pas.',
    };
    setErrors(found);
    if (found.current || found.next || found.confirm) {
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(current, next);
      close();
      setDone(true);
    } catch (error) {
      setErrors(
        error instanceof CurrentPasswordError
          ? { current: error.message }
          : { form: authErrorMessage(error) }
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SettingsSection title="Sécurité & session" flush>
      <SettingsRow
        icon="lock-reset"
        label="Changer le mot de passe"
        subtitle="Le mot de passe actuel sera redemandé"
        trailing={done && !open ? <StatusBadge tone="ok" label="Modifié" /> : undefined}
        onPress={() => {
          setDone(false);
          if (open) {
            close();
          } else {
            setOpen(true);
          }
        }}
      />

      {open ? (
        <View style={styles.editor}>
          <TextField
            label="Mot de passe actuel"
            value={current}
            onChangeText={setCurrent}
            errorText={errors.current}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
          />
          <TextField
            label="Nouveau mot de passe"
            value={next}
            onChangeText={setNext}
            errorText={errors.next}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <TextField
            label="Confirmation"
            value={confirm}
            onChangeText={setConfirm}
            errorText={errors.confirm}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
          {errors.form ? (
            <Text style={[styles.error, { color: colors.danger }]}>{errors.form}</Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              title="Enregistrer"
              loading={submitting}
              onPress={() => void handleSubmit()}
            />
            <Button title="Annuler" variant="ghost" disabled={submitting} onPress={close} />
          </View>
        </View>
      ) : null}

      <SettingsDivider />

      {/* Aucune navigation après la déconnexion : Stack.Protected bascule seul sur la connexion. */}
      <SettingsRow
        icon="logout"
        label="Se déconnecter"
        subtitle="Clôturer la session sur cet appareil"
        onPress={() => {
          setSignOutError(undefined);
          signOut().catch((error: unknown) => setSignOutError(authErrorMessage(error)));
        }}
      />
      {signOutError ? (
        <Text style={[styles.error, styles.rowError, { color: colors.danger }]}>
          {signOutError}
        </Text>
      ) : null}
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
    fontSize: 13,
  },
  rowError: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
});
