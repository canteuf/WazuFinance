import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AuthError } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Fragment, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SettingsSection } from '@/components/settings/settings-section';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/hooks/use-auth';
import { useDeletionBlockers } from '@/hooks/use-deletion-blockers';
import { authErrorMessage, CurrentPasswordError } from '@/lib/auth-errors';
import { dataErrorMessage } from '@/lib/data-errors';
import { queryKeys } from '@/lib/query-keys';
import { font, radius, spacing, useColors, useIsDark } from '@/theme/tokens';

/**
 * Suppression du compte, dans la zone de danger.
 *
 * Deux temps : le bouton de la maquette ouvre une confirmation qui redemande le mot de passe, et c'est elle qui supprime. Un seul appui sur « Supprimer définitivement » effaçant tout, sur un écran qu'on fait défiler du pouce, serait un piège.
 *
 * Bloquée tant qu'un groupe partagé possédé a d'autres membres : même règle, et même remède, que « Quitter le groupe » à l'écran 7. Une action impossible est expliquée, pas simplement désactivée.
 *
 * La confirmation est portée par l'état du composant, pas par `Alert.alert`, qui ne fait rien sur le web. Succès : aucune navigation, la déconnexion locale fait basculer Stack.Protected vers la connexion.
 */
export function DeleteAccountSection() {
  const colors = useColors();
  const isDark = useIsDark();
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

  function cancel() {
    setConfirming(false);
    setPassword('');
    setPasswordError(undefined);
    setFormError(undefined);
  }

  const blocked = blockers.length > 0;

  return (
    <SettingsSection title="Zone de danger" tone="danger">
      <View style={styles.head}>
        <View style={[styles.glyph, { backgroundColor: tint(colors.danger, isDark) }]}>
          <MaterialCommunityIcons name="alert-outline" size={22} color={colors.danger} />
        </View>
        <View style={styles.headText}>
          <Text style={[styles.title, { color: colors.danger }]}>Supprimer mon compte</Text>

          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : blockersError ? (
            <Text style={[styles.body, { color: colors.danger }]}>
              {dataErrorMessage(blockersError)}
            </Text>
          ) : blocked ? (
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
              . Excluez ces membres avant de supprimer votre compte.
            </Text>
          ) : confirming ? (
            // Tout ce qui part est nommé, y compris ce qui disparaîtra pour d'autres : les opérations dans un groupe partagé ne sont pas qu'à soi.
            <Text style={[styles.body, { color: colors.text }]}>
              Seront supprimés : votre compte personnel et toutes ses opérations, budgets et
              objectifs d’épargne ; les groupes partagés dont vous êtes le seul membre ; vos
              opérations dans les autres groupes partagés, y compris ceux que vous avez quittés,
              qui disparaîtront aussi pour leurs membres.
            </Text>
          ) : (
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Action irréversible. Votre compte personnel et vos opérations, y compris dans les
              groupes partagés, seront définitivement effacés.
            </Text>
          )}
        </View>
      </View>

      {confirming && !blocked ? (
        <>
          <TextField
            label="Mot de passe actuel"
            value={password}
            onChangeText={setPassword}
            errorText={passwordError}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            autoFocus
          />
          {formError ? (
            <Text style={[styles.error, { color: colors.danger }]}>{formError}</Text>
          ) : null}
        </>
      ) : null}

      <DangerButton
        loading={submitting}
        disabled={isLoading || blocked || (confirming && password === '')}
        onPress={() => {
          if (confirming) {
            void handleDelete();
          } else {
            setConfirming(true);
          }
        }}
      />
      {confirming && !blocked ? (
        <Button title="Annuler" variant="ghost" disabled={submitting} onPress={cancel} />
      ) : null}
    </SettingsSection>
  );
}

/** Aplat très dilué d'une couleur en Carnet ; surface neutre en Nocturne, où un aplat clair perdrait le contraste — même règle que StatusBadge. */
function tint(color: string, isDark: boolean): string {
  return isDark ? 'rgba(255,255,255,0.06)' : `${color}1F`;
}

/**
 * Bouton pâle de la maquette plutôt que le `variant="danger"` plein de `Button` : dans une zone déjà signalée en rouge, un aplat saturé criait plus fort que nécessaire. Le rouge reste porté par le texte et l'icône.
 */
function DangerButton({
  loading,
  disabled,
  onPress,
}: {
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const isDark = useIsDark();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.danger,
        {
          backgroundColor: tint(colors.danger, isDark),
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.danger} />
      ) : (
        <>
          <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
          <Text style={[styles.dangerLabel, { color: colors.danger }]}>
            Supprimer définitivement
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  glyph: {
    width: 48,
    height: 48,
    // Rond : c'est un signal d'alerte, pas un poste de dépense, et il reprend la forme du triangle posé dessus plutôt que celle des pastilles de rangée.
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 20,
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 22,
    // Justifié : le paragraphe fait quatre à cinq lignes pleines, et un bord droit en dents de scie donnait un air brouillon à la seule carte de l'app qu'on veut voir lue jusqu'au bout. Android n'applique `justify` qu'à partir d'API 26 ; en dessous le texte reste aligné à gauche, ce qui est le rendu actuel.
    textAlign: 'justify',
  },
  link: {
    fontFamily: font.semibold,
  },
  loader: {
    alignSelf: 'flex-start',
  },
  danger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.md,
  },
  dangerLabel: {
    fontFamily: font.bold,
    fontSize: 17,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 15,
  },
});
