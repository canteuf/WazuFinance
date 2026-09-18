import { AuthError } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Fragment, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SettingsSection } from '@/components/settings/settings-section';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/hooks/use-auth';
import { useDeletionBlockers } from '@/hooks/use-deletion-blockers';
import { authErrorMessage, CurrentPasswordError } from '@/lib/auth-errors';
import { dataErrorMessage } from '@/lib/data-errors';
import { queryKeys } from '@/lib/query-keys';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Suppression du compte.
 *
 * Bloquée tant qu'un groupe partagé possédé a d'autres membres : même règle, et même remède, que « Quitter le groupe » à l'écran 7. Une action impossible est expliquée, pas simplement désactivée.
 *
 * La confirmation est portée par l'état du composant, pas par `Alert.alert`, qui ne fait rien sur le web — même motif que budget-form.tsx.
 *
 * Succès : aucune navigation. La déconnexion locale fait basculer Stack.Protected vers la connexion, et toute redirection manuelle se battrait avec lui.
 */
export function DeleteAccountSection() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { deleteAccount } = useAuth();
  const { blockers, isLoading, error: blockersError } = useDeletionBlockers();

  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setPasswordError(undefined);
    setFormError(undefined);
    setSubmitting(true);
    try {
      await deleteAccount(password);
    } catch (error) {
      if (error instanceof CurrentPasswordError) {
        setPasswordError(error.message);
      } else if (error instanceof AuthError) {
        setFormError(authErrorMessage(error));
      } else {
        // Refus de la base : la liste affichée était périmée, un membre a rejoint un groupe possédé entre-temps. Le message de delete_own_account() nomme le groupe ; on recharge la liste pour que la section passe à l'état bloqué.
        setFormError(dataErrorMessage(error));
        void queryClient.invalidateQueries({ queryKey: queryKeys.deletionBlockers() });
      }
      // Seulement en échec : en cas de succès, l'écran est démonté par la déconnexion, et mettre à jour son état ferait avertir React.
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <SettingsSection title="Supprimer le compte">
        <ActivityIndicator color={colors.primary} />
      </SettingsSection>
    );
  }

  if (blockersError) {
    return (
      <SettingsSection title="Supprimer le compte">
        <Text style={[styles.error, { color: colors.danger }]}>
          {dataErrorMessage(blockersError)}
        </Text>
      </SettingsSection>
    );
  }

  if (blockers.length > 0) {
    return (
      <SettingsSection title="Supprimer le compte">
        <Text style={[styles.body, { color: colors.text }]}>
          Ces groupes partagés dont vous êtes propriétaire ont encore d’autres membres :{' '}
          {blockers.map((blocker, index) => (
            <Fragment key={blocker.groupId}>
              {index > 0 ? ', ' : ''}
              {/* Chaque nom ouvre la gestion du groupe, là où se trouve le remède. */}
              <Link
                href={`/group?id=${blocker.groupId}`}
                style={[styles.link, { color: colors.primary }]}
              >
                « {blocker.name} »
              </Link>
            </Fragment>
          ))}
          . Excluez ces membres depuis la gestion du groupe avant de supprimer votre compte.
        </Text>
        <Button title="Supprimer mon compte" variant="danger" disabled onPress={() => {}} />
      </SettingsSection>
    );
  }

  if (!confirming) {
    return (
      <SettingsSection title="Supprimer le compte">
        <Button
          title="Supprimer mon compte"
          variant="danger"
          onPress={() => setConfirming(true)}
        />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Supprimer le compte">
      {/* Tout ce qui part est nommé, y compris ce qui disparaîtra pour d'autres : les opérations dans un groupe partagé ne sont pas qu'à soi. */}
      <Text style={[styles.body, { color: colors.text }]}>
        Cette action est définitive. Seront supprimés : votre compte personnel et toutes ses
        opérations, budgets et objectifs d’épargne ; les groupes partagés dont vous êtes le seul
        membre ; vos opérations dans les autres groupes partagés, y compris ceux que vous avez
        quittés, qui disparaîtront aussi pour leurs membres.
      </Text>
      <TextField
        label="Mot de passe actuel"
        value={password}
        onChangeText={setPassword}
        errorText={passwordError}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
      />
      {formError ? (
        <Text style={[styles.error, { color: colors.danger }]}>{formError}</Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          title="Supprimer définitivement"
          variant="danger"
          loading={submitting}
          disabled={password === ''}
          onPress={() => void handleDelete()}
        />
        <Button
          title="Annuler"
          variant="ghost"
          disabled={submitting}
          onPress={() => {
            setConfirming(false);
            setPassword('');
            setPasswordError(undefined);
            setFormError(undefined);
          }}
        />
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  body: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  link: {
    fontFamily: font.semibold,
  },
  actions: {
    gap: spacing.xs,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 13,
  },
});
