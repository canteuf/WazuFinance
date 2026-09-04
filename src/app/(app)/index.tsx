import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { spacing, useColors } from '@/theme/tokens';

/**
 * Placeholder de l'écran 2 (tableau de bord).
 *
 * Il sert pour l'instant de vérification de bout en bout : si le nom et le
 * groupe personnel s'affichent, c'est que la session, le trigger d'inscription
 * et les policies RLS fonctionnent. Il sera remplacé par la vue patrimoine.
 */
export default function DashboardScreen() {
  const colors = useColors();
  const { session, signOut } = useAuth();
  const [profile, setProfile] = useState<{ displayName: string; groupName: string }>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) {
      return;
    }

    let active = true;

    async function load(id: string) {
      const [user, group] = await Promise.all([
        supabase.from('users').select('display_name').eq('id', id).single(),
        supabase.from('budget_groups').select('name').eq('owner_id', id).eq('is_personal', true).single(),
      ]);

      if (!active) {
        return;
      }

      if (user.error || group.error) {
        setError(user.error?.message ?? group.error?.message);
        return;
      }

      setProfile({ displayName: user.data.display_name, groupName: group.data.name });
    }

    void load(userId);

    return () => {
      active = false;
    };
  }, [session?.user.id]);

  return (
    <Screen>
      <View style={styles.block}>
        <Text style={[styles.title, { color: colors.text }]}>
          Bonjour {profile?.displayName ?? '…'}
        </Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{session?.user.email}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Groupe : {profile?.groupName ?? '…'}
        </Text>
        {error ? <Text style={[styles.body, { color: colors.danger }]}>{error}</Text> : null}
      </View>

      <Text style={[styles.body, { color: colors.textMuted }]}>
        Tableau de bord, transactions, budgets et objectifs arrivent dans la passe suivante.
      </Text>

      <Button title="Se déconnecter" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.xs,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
  },
  body: {
    fontSize: 15,
  },
});
