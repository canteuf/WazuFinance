import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SettingsSection } from '@/components/settings/settings-section';
import { Button } from '@/components/ui/button';
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
 * Changement de mot de passe, replié par défaut : c'est un geste rare, et trois champs ouverts en permanence alourdiraient l'écran pour rien.
 *
 * Pas de `useMutation` : comme la connexion et l'inscription, l'action passe par `useAuth()` avec un état local de chargement et d'erreur.
 */
export function PasswordSection() {
  const colors = useColors();
  const { changePassword } = useAuth();

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function reset() {
    setCurrent('');
    setNext('');
    setConfirm('');
    setErrors({});
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
      reset();
      setOpen(false);
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
    <SettingsSection title="Mot de passe">
      {open ? (
        <>
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
            <Button
              title="Annuler"
              variant="ghost"
              disabled={submitting}
              onPress={() => {
                reset();
                setOpen(false);
              }}
            />
          </View>
        </>
      ) : (
        <>
          {done ? (
            <Text style={[styles.done, { color: colors.positive }]}>Mot de passe modifié.</Text>
          ) : null}
          <Button
            title="Changer le mot de passe"
            variant="ghost"
            onPress={() => {
              setDone(false);
              setOpen(true);
            }}
          />
        </>
      )}
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.xs,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 13,
  },
  done: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
});
