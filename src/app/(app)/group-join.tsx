import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { normalizeInvitationCode } from '@/lib/invitation-code';
import { goBackOr } from '@/lib/navigation';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/**
 * Rejoindre un groupe par code d'invitation (spec section 1, écran 7).
 *
 * `join_group_with_code()` compare le code par égalité stricte, sans normaliser la casse : la saisie passe en minuscules avant l'appel, puisque la base génère toujours du hex minuscule (migration group_management).
 */
export default function GroupJoinScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setActiveGroupId } = useActiveGroup();
  const { joinGroup, isJoining } = useGroupMutations();
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const [errorText, setErrorText] = useState<string>();

  const valid = code.trim() !== '';

  function handleSubmit() {
    setTouched(true);
    setErrorText(undefined);
    if (!valid) {
      return;
    }
    // Minuscules et sans tiret : le code s'affiche « A3F0-9B12 » chez le propriétaire, mais la base stocke « a3f09b12 » et compare le texte exact.
    joinGroup.mutate(normalizeInvitationCode(code), {
      onSuccess: (groupId) => {
        setActiveGroupId(groupId);
        goBackOr(router, '/groups');
      },
      onError: (error) => setErrorText(dataErrorMessage(error)),
    });
  }

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Rejoindre un groupe</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          hitSlop={spacing.sm}
          onPress={() => goBackOr(router, '/groups')}
          style={styles.closeButton}
        >
          <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.form}>
        <TextInput
          accessibilityLabel="Code d’invitation"
          placeholder="Code à 8 caractères"
          placeholderTextColor={colors.textMuted}
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          style={[
            styles.code,
            { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
          ]}
        />

        {touched && !valid ? (
          <Text style={[styles.error, { color: colors.danger }]}>Entrez le code reçu.</Text>
        ) : null}
        {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

        <Button title="Rejoindre" loading={isJoining} onPress={handleSubmit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 19,
    letterSpacing: -0.2,
  },
  closeButton: {
    padding: spacing.xs,
  },
  form: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  code: {
    fontFamily: font.semibold,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 18,
    letterSpacing: 2,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 15,
  },
});
