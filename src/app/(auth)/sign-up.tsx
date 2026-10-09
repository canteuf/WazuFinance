import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { LegalLinks } from '@/components/legal/legal-links';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/hooks/use-auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { goBackOr } from '@/lib/navigation';
import {
  DISPLAY_NAME_MAX_LENGTH,
  validateDisplayName,
  validateEmail,
  validatePassword,
} from '@/lib/validation';
import { font, radius, spacing, useColors } from '@/theme/tokens';

type FieldErrors = {
  displayName?: string;
  email?: string;
  password?: string;
  confirmation?: string;
  consent?: string;
};

export default function SignUpScreen() {
  const colors = useColors();
  const router = useRouter();
  const { signUp } = useAuth();

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmationRef = useRef<TextInput>(null);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [consent, setConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const errors: FieldErrors = {
      displayName: validateDisplayName(displayName),
      email: validateEmail(email),
      password: validatePassword(password),
      confirmation: password === confirmation ? undefined : 'Les mots de passe ne correspondent pas.',
      consent: consent ? undefined : 'Cochez la case pour créer votre compte.',
    };
    setFieldErrors(errors);
    setFormError(undefined);

    if (Object.values(errors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    try {
      const { needsEmailConfirmation } = await signUp(email, password, displayName);
      if (needsEmailConfirmation) {
        // replace, pas push : revenir en arrière ne doit pas rouvrir un formulaire déjà envoyé.
        router.replace({ pathname: '/confirm-email', params: { email: email.trim() } });
        return;
      }
      // Session immédiate : la garde du layout racine bascule seule sur (app).
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        {/* Même monogramme qu'à la connexion : les deux écrans forment une seule porte d'entrée, et changer d'en-tête entre eux donnerait l'impression d'avoir changé d'application. */}
        <View style={[styles.mark, { backgroundColor: colors.primary }]}>
          <Text style={[styles.markLetter, { color: colors.primaryText }]}>W</Text>
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Créer un compte</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Votre compte personnel est privé. Vous pourrez ensuite partager un budget.
        </Text>
      </View>

      <TextField
        label="Nom affiché"
        value={displayName}
        onChangeText={setDisplayName}
        errorText={fieldErrors.displayName}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
        placeholder="Camille"
        maxLength={DISPLAY_NAME_MAX_LENGTH}
      />

      <TextField
        ref={emailRef}
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
        onSubmitEditing={() => void handleSubmit()}
      />

      {/* Le consentement que les CGU (section 2) et la politique de confidentialité supposent, avec l'âge minimum de 18 ans. Sa version part avec le compte : voir src/lib/legal.ts. */}
      <View style={styles.consent}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          onPress={() => setConsent((value) => !value)}
          style={styles.consentRow}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: consent ? colors.primary : fieldErrors.consent ? colors.danger : colors.textMuted,
                backgroundColor: consent ? colors.primary : 'transparent',
              },
            ]}
          >
            {consent ? <MaterialCommunityIcons name="check" size={18} color={colors.primaryText} /> : null}
          </View>
          <Text style={[styles.consentLabel, { color: colors.text }]}>
            J’ai 18 ans ou plus, et j’accepte les conditions d’utilisation et la politique de confidentialité.
          </Text>
        </Pressable>
        {fieldErrors.consent && !consent ? (
          <Text accessibilityLiveRegion="polite" style={[styles.consentError, { color: colors.danger }]}>
            {fieldErrors.consent}
          </Text>
        ) : null}
        <LegalLinks />
      </View>

      {/* Annoncé dès qu'il apparaît, comme sur l'écran du mot de passe oublié. */}
      {formError ? (
        <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.danger }]}>
          {formError}
        </Text>
      ) : null}

      <Button title="Créer mon compte" loading={submitting} onPress={() => void handleSubmit()} />
      <Button
        title="J’ai déjà un compte"
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
    letterSpacing: -0.7,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 17,
    textAlign: 'center',
  },
  message: {
    fontFamily: font.medium,
    fontSize: 16,
  },
  consent: {
    gap: spacing.xs,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 26,
    height: 26,
    marginTop: 1,
    borderRadius: radius.sm - 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentLabel: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 22,
  },
  consentError: {
    fontFamily: font.medium,
    fontSize: 15,
  },
});
