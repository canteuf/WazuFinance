import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { font, radius, spacing, useColors, useElevation } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Grand bouton plein en pilule qui clôt un formulaire, comme « Enregistrer l'écriture » sur la saisie. */
export function PrimaryAction({
  label,
  icon = 'check',
  loading,
  disabled = false,
  onPress,
}: {
  label: string;
  icon?: IconName;
  loading: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const elevation = useElevation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        elevation.floating,
        { backgroundColor: colors.primary, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.primaryText} />
      ) : (
        <>
          <MaterialCommunityIcons name={icon} size={22} color={colors.primaryText} />
          <Text style={[styles.primaryLabel, { color: colors.primaryText }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * Lien rouge de suppression, puis confirmation en deux boutons.
 *
 * Confirmation portée par l'état du composant, pas par Alert.alert : l'app est aussi testée dans un navigateur, où Alert.alert ne fait rien — une suppression qui en dépendrait y serait silencieusement impossible.
 */
export function DeleteAction({
  label,
  confirmAccessibilityLabel,
  deleting,
  disabled,
  onConfirm,
}: {
  label: string;
  confirmAccessibilityLabel: string;
  deleting: boolean;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const colors = useColors();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <View style={styles.confirmRow}>
        <Button
          title="Confirmer la suppression"
          variant="danger"
          loading={deleting}
          disabled={disabled || deleting}
          accessibilityLabel={confirmAccessibilityLabel}
          onPress={onConfirm}
        />
        <Button
          title="Annuler"
          variant="ghost"
          disabled={disabled || deleting}
          onPress={() => setConfirming(false)}
        />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || deleting}
      onPress={() => setConfirming(true)}
      style={styles.link}
    >
      <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
      <Text style={[styles.linkLabel, { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 58,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
  },
  primaryLabel: {
    fontFamily: font.bold,
    fontSize: 19,
  },
  confirmRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  linkLabel: {
    fontFamily: font.semibold,
    fontSize: 17,
  },
});
