import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/hooks/use-auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { goBackOr } from '@/lib/navigation';
import { validateEmail, validatePassword, validateRecoveryCode } from '@/lib/validation';
import { font, spacing, useColors } from '@/theme/tokens';

type FieldErrors = {
  email?: string;
  code?: string;
  password?: string;
  confirmation?: string;
};

/**
 * Mot de passe oublié, en deux temps sur un seul écran : l'adresse, puis le code reçu par email avec le nouveau mot de passe.
 *
 * Un code plutôt qu'un lien : un lien ouvre le navigateur, et ramener l'utilisateur dans l'app avec sa session demande une redirection que le projet ne gère pas. Le code se recopie depuis la boîte mail sur le même téléphone. Le modèle d'email « Reset password » du projet Supabase doit donc afficher `{{ .Token }}` (voir supabase/templates/recovery.html).
 *
 * Pas de navigation à la fin : une fois le mot de passe enregistré, la session arrive et la garde du layout racine bascule sur (app).
 */
export default function ForgotPasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const { sendPasswordResetCode, resetPasswordWithCode } = useAuth();

  const passwordRef = useRef<TextInput>(null);
  const confirmationRef = useRef<TextInput>(null);

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSendCode() {
    const errors: FieldErrors = { email: validateEmail(email) };
    setFieldErrors(errors);
    setFormError(undefined);
    setNotice(undefined);

    if (errors.email) {
      return;
    }

    setSubmitting(true);
    try {
      await sendPasswordResetCode(email);
      setStep('code');
      // Formulation au conditionnel : Supabase répond de la même façon qu'un compte existe ou non, et l'écran ne doit pas en dire plus.
      setNotice(`Si un compte existe pour ${email.trim()}, un code vient d’y être envoyé.`);
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset() {
    const errors: FieldErrors = {
      code: validateRecoveryCode(code),
      password: validatePassword(password),
      confirmation: password === confirmation ? undefined : 'Les mots de passe ne correspondent pas.',
    };
    setFieldErrors(errors);
    setFormError(undefined);

    if (Object.values(errors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    try {
      await resetPasswordWithCode(email, code.trim(), password);
    } catch (error) {
      setNotice(undefined);
      setFormError(authErrorMessage(error));
      setSubmitting(false);
    }
    // Pas de `finally` : après un succès, l'écran est démonté par la garde, et le bouton doit continuer de tourner jusque-là.
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Mot de passe oublié</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {step === 'email'
            ? 'Saisissez l’email de votre compte : nous vous enverrons un code pour choisir un nouveau mot de passe.'
            : 'Recopiez le code reçu par email, puis choisissez votre nouveau mot de passe.'}
        </Text>
      </View>

      {step === 'email' ? (
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          errorText={fieldErrors.email}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={() => void handleSendCode()}
          placeholder="vous@exemple.fr"
          autoFocus
        />
      ) : (
        <>
          <TextField
            label="Code reçu par email"
            value={code}
            onChangeText={setCode}
            errorText={fieldErrors.code}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            autoFocus
          />

          <TextField
            ref={passwordRef}
            label="Nouveau mot de passe"
            value={password}
            onChangeText={setPassword}
            errorText={fieldErrors.password}
            autoCapitalize="none"
            autoComplete="new-password"
            secureTextEntry
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmationRef.current?.focus()}
          />

          <TextField
            ref={confirmationRef}
            label="Confirmation"
            value={confirmation}
            onChangeText={setConfirmation}
            errorText={fieldErrors.confirmation}
            autoCapitalize="none"
            autoComplete="new-password"
            secureTextEntry
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={() => void handleReset()}
          />
        </>
      )}

      {notice ? (
        <Text
          style={[styles.message, { color: colors.textMuted }]}
          accessibilityLiveRegion="polite"
        >
          {notice}
        </Text>
      ) : null}
      {formError ? (
        <Text
          style={[styles.message, { color: colors.danger }]}
          accessibilityLiveRegion="assertive"
        >
          {formError}
        </Text>
      ) : null}

      {step === 'email' ? (
        <Button title="Recevoir un code" loading={submitting} onPress={() => void handleSendCode()} />
      ) : (
        <>
          <Button
            title="Enregistrer le mot de passe"
            loading={submitting}
            onPress={() => void handleReset()}
          />
          <Button
            title="Renvoyer un code"
            variant="ghost"
            disabled={submitting}
            onPress={() => void handleSendCode()}
          />
        </>
      )}

      <Button
        title="Retour à la connexion"
        variant="ghost"
        onPress={() => goBackOr(router, '/sign-in')}
      />
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
  message: {
    fontFamily: font.medium,
    fontSize: 16,
  },
});
