import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/hooks/use-auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { validateEmail, validatePassword } from '@/lib/validation';
import { font, radius, spacing, useColors } from '@/theme/tokens';

type FieldErrors = {
  email?: string;
  password?: string;
};

export default function SignInScreen() {
  const colors = useColors();
  const { signIn } = useAuth();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const errors: FieldErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setFieldErrors(errors);
    setFormError(undefined);

    if (errors.email || errors.password) {
      return;
    }

    setSubmitting(true);
    try {
      await signIn(email, password);
      // Pas de navigation ici : la garde du layout racine bascule sur (app) dès que la session arrive.
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        {/* Le monogramme tient lieu de logo : une marque dessinée n'existe pas encore, et un carré à l'accent du thème vaut mieux qu'un espace vide au-dessus du titre. */}
        <View style={[styles.mark, { backgroundColor: colors.primary }]}>
          <Text style={[styles.markLetter, { color: colors.primaryText }]}>W</Text>
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Wazu Finance</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Connectez-vous pour retrouver vos budgets.
        </Text>
      </View>

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
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        placeholder="vous@exemple.fr"
      />

      <TextField
        ref={passwordRef}
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        errorText={fieldErrors.password}
        autoCapitalize="none"
        autoComplete="current-password"
        secureTextEntry
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void handleSubmit()}
      />

      {formError ? <Text style={[styles.formError, { color: colors.danger }]}>{formError}</Text> : null}

      <Button title="Se connecter" loading={submitting} onPress={() => void handleSubmit()} />

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textMuted }]}>Pas encore de compte ?</Text>
        <Link href="/sign-up" style={[styles.footerLink, { color: colors.primary }]}>
          Créer un compte
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  markLetter: {
    fontFamily: font.black,
    fontSize: 26,
    lineHeight: 32,
  },
  title: {
    fontFamily: font.black,
    fontSize: 28,
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 15,
  },
  formError: {
    fontFamily: font.medium,
    fontSize: 14,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  footerText: {
    fontFamily: font.regular,
    fontSize: 14,
  },
  footerLink: {
    fontFamily: font.bold,
    fontSize: 14,
  },
});
