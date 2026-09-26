import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/use-auth';
import { useIsOnline, usePendingWrites } from '@/hooks/use-offline-status';
import { formatSkew, isClockWrong } from '@/lib/clock';
import { font, spacing, useColors } from '@/theme/tokens';

function writes(count: number): string {
  return count === 1 ? '1 opération' : `${count} opérations`;
}

/** Ce que le bandeau a à dire ; rien quand le réseau va bien, que rien n'attend et que l'heure est juste. */
function useBannerState() {
  const online = useIsOnline();
  const pending = usePendingWrites();
  const { clockSkewMs } = useAuth();
  const clockWrong = isClockWrong(clockSkewMs);
  const network = online && pending === 0;
  return { online, pending, clockSkewMs, clockWrong, network, visible: !network || clockWrong };
}

/**
 * Vrai quand le bandeau s'affiche. Le layout `(app)` s'en sert pour retirer la zone sûre du haut aux écrans placés dessous : le bandeau l'occupe déjà.
 */
export function useOfflineBannerVisible(): boolean {
  return useBannerState().visible;
}

/**
 * Bandeau d'état de la connexion, au-dessus de tous les écrans de l'app, visible seulement quand il a quelque chose à dire.
 *
 * Hors ligne, les chiffres affichés sont ceux du dernier chargement et une saisie n'apparaît qu'après son envoi : sans ce bandeau, une dépense tout juste enregistrée semblerait perdue. Il dit donc les deux choses qui manquent à l'écran — que les données peuvent dater, et combien d'écritures attendent. Il prévient aussi quand l'heure du téléphone est fausse.
 *
 * Il porte lui-même la zone sûre du haut, celle de la barre d'état. Les écrans placés dessous ne doivent pas la recompter : le layout `(app)` leur passe alors des marges dont le haut vaut zéro (`useOfflineBannerVisible`), et tous les écrans lisent leurs marges par `useSafeAreaInsets()`. Une `SafeAreaView` native, qui mesure elle-même, remettait la hauteur de la barre d'état sous le bandeau et creusait un vide sur chaque écran hors ligne.
 */
export function OfflineBanner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { online, pending, clockSkewMs, clockWrong, network, visible } = useBannerState();

  if (!visible) {
    return null;
  }

  const message = online
    ? `Envoi de ${writes(pending)}…`
    : pending > 0
      ? `Hors ligne · ${writes(pending)} en attente d’envoi`
      : 'Hors ligne · chiffres du dernier chargement';

  // Une ligne à part : l'heure fausse ne dépend pas du réseau, et les dates des saisies, les périodes et les échéances se calculent sur le téléphone.
  const clockMessage =
    clockWrong && clockSkewMs !== null
      ? `L’heure du téléphone a ${formatSkew(clockSkewMs)} ${clockSkewMs > 0 ? 'd’avance' : 'de retard'}. Corrigez-la dans les réglages : les dates des opérations en dépendent.`
      : null;

  return (
    <View style={{ backgroundColor: colors.surfaceMuted, paddingTop: insets.top }}>
      {network ? null : (
        <View
          style={styles.row}
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={message}
        >
          <MaterialCommunityIcons
            name={online ? 'cloud-upload-outline' : 'cloud-off-outline'}
            size={16}
            color={colors.textMuted}
          />
          <Text style={[styles.label, { color: colors.text }]}>{message}</Text>
        </View>
      )}
      {clockMessage ? (
        <View
          style={styles.row}
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={clockMessage}
        >
          <MaterialCommunityIcons name="clock-alert-outline" size={16} color={colors.warning} />
          <Text style={[styles.label, { color: colors.text }]}>{clockMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  label: {
    fontFamily: font.medium,
    fontSize: 14,
    flexShrink: 1,
    textAlign: 'center',
  },
});
