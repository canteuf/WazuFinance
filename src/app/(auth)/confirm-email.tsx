import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/hooks/use-auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { goBackOr } from '@/lib/navigation';
import { validateRecoveryCode } from '@/lib/validation';
import { font, spacing, useColors } from '@/theme/tokens';

/**
 * Confirmation de l'adresse à l'inscription, par le code reçu par email — comme la réinitialisation du mot de passe, et pour la même raison : un lien ouvrirait le navigateur, pas l'app. Le modèle « Confirm signup » du projet Supabase doit donc afficher `{{ .Token }}` (voir supabase/templates/confirmation.html).
 *
 * Deux entrées : l'inscription, qui vient d'envoyer le code, et la connexion d'un compte jamais confirmé (`resend=1`), qui en demande un nouveau en arrivant.
 *
 * Sans confirmation, n'importe qui pouvait inscrire l'adresse d'une autre personne et garder la main sur le compte qu'elle reprendrait ensuite par « Mot de passe oublié ».
 *
 * Pas de navigation à la fin : le code vérifié ouvre la session, et la garde du layout racine bascule sur (app).
 */
export default function ConfirmEmailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { confirmSignUp, resendSignUpCode } = useAuth();
  const params = useLocalSearchParams<{ email?: string; resend?: string }>();
  const email = params.email ?? '';

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  // Un seul envoi à l'arrivée, même si l'effet est rejoué (mode strict en développement) : chaque envoi compte dans la limite d'emails par heure.
  const sentOnArrival = useRef(false);

  async function handleResend() {
    setFormError(undefined);
    setNotice(undefined);
    setResending(true);
    try {
      await resendSignUpCode(email);
      setNotice(`Un nouveau code vient d’être envoyé à ${email.trim()}.`);
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setResending(false);
    }
  }

  useEffect(() => {
    if (params.resend === '1' && email && !sentOnArrival.current) {
      sentOnArrival.current = true;
      void handleResend();
    }
    // Envoi à l'arrivée seulement : handleResend change à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirm() {
    const error = validateRecoveryCode(code);
    setCodeError(error);
    setFormError(undefined);
    if (error) {
      return;
    }

    setSubmitting(true);
    try {
      await confirmSignUp(email, code.trim());
    } catch (caught) {
      setNotice(undefined);
      setFormError(authErrorMessage(caught));
      setSubmitting(false);
    }
    // Pas de `finally` : après un succès, l'écran est démonté par la garde, et le bouton doit continuer de tourner jusque-là.
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Confirmez votre email</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Recopiez le code envoyé à {email.trim()} pour activer votre compte.
        </Text>
      </View>

      <TextField
        label="Code reçu par email"
        value={code}
        onChangeText={setCode}
        errorText={codeError}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        returnKeyType="go"
        onSubmitEditing={() => void handleConfirm()}
        autoFocus
      />

      {/* Rien ne dit ici si l'adresse avait déjà un compte : Supabase répond pareil dans les deux cas, pour ne pas révéler qui est inscrit. */}
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        Rien reçu ? Regardez dans les courriers indésirables, ou renvoyez un code. Si cette adresse a déjà un compte, connectez-vous.
      </Text>

      {notice ? (
        <Text style={[styles.message, { color: colors.textMuted }]} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
      {formError ? (
        <Text style={[styles.message, { color: colors.danger }]} accessibilityLiveRegion="assertive">
          {formError}
        </Text>
      ) : null}

      <Button title="Activer mon compte" loading={submitting} onPress={() => void handleConfirm()} />
      <Button
        title="Renvoyer un code"
        variant="ghost"
        loading={resending}
        disabled={submitting}
        onPress={() => void handleResend()}
      />
      <Button title="Retour à la connexion" variant="ghost" onPress={() => goBackOr(router, '/sign-in')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: font.black,
    fontSize: 28,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 17,
    lineHeight: 23,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 21,
  },
  message: {
    fontFamily: font.medium,
    fontSize: 16,
  },
});
