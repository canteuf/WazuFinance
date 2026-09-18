import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useActiveGroup } from '@/hooks/use-active-group';
import { useGroupMutations } from '@/hooks/use-group-mutations';
import { dataErrorMessage } from '@/lib/data-errors';
import { goBackOr } from '@/lib/navigation';
import { font, radius, spacing, useColors } from '@/theme/tokens';

/** Créer un groupe partagé (spec section 1, écran 7). formSheet, un seul champ. */
export default function GroupCreateScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setActiveGroupId } = useActiveGroup();
  const { createGroup, isCreating } = useGroupMutations();
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [errorText, setErrorText] = useState<string>();

  const valid = name.trim() !== '';

  function handleSubmit() {
    setTouched(true);
    setErrorText(undefined);
    if (!valid) {
      return;
    }
    createGroup.mutate(name.trim(), {
      onSuccess: (groupId) => {
        // Le groupe qu'on vient de créer devient le groupe actif : sinon l'utilisateur resterait sur son compte personnel sans comprendre où est passé le groupe qu'il vient de créer.
        setActiveGroupId(groupId);
        goBackOr(router, '/groups');
      },
      onError: (error) => setErrorText(dataErrorMessage(error)),
    });
  }

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Créer un groupe partagé</Text>
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
          accessibilityLabel="Nom du groupe"
          placeholder="Coloc, Famille…"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          autoFocus
          style={[
            styles.name,
            { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
          ]}
        />

        {touched && !valid ? (
          <Text style={[styles.error, { color: colors.danger }]}>Donnez un nom au groupe.</Text>
        ) : null}
        {errorText ? <Text style={[styles.error, { color: colors.danger }]}>{errorText}</Text> : null}

        <Button title="Créer" loading={isCreating} onPress={handleSubmit} />
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
    fontSize: 17,
    letterSpacing: -0.2,
  },
  closeButton: {
    padding: spacing.xs,
  },
  form: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  name: {
    fontFamily: font.semibold,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 13,
  },
});
