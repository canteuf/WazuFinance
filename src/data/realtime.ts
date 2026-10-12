import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

let mounts = 0;

/**
 * Un nom de canal propre à un montage, pour les abonnements postgres_changes, dont le nom est libre.
 *
 * `supabase.channel(nom)` rend le canal existant de même nom. Quitter un groupe puis y revenir dans la seconde retrouvait le canal du premier montage, encore en train de se fermer (`removeChannel` est asynchrone) : `.on()` et `.subscribe()` n'y faisaient rien, puis la fermeture arrivait, et le groupe actif n'avait plus de mises à jour en direct jusqu'au changement de groupe suivant.
 */
export function uniqueChannelName(base: string): string {
  mounts += 1;
  return `${base}#${mounts}`;
}

/**
 * Un canal privé sur le sujet `topic`, dont le nom ne peut pas changer : c'est lui que la base vise (realtime.send) et que la policy de realtime.messages autorise. Un canal du même sujet laissé par un montage précédent est d'abord fermé pour de bon, pour la raison donnée dans uniqueChannelName().
 */
export async function openPrivateChannel(topic: string): Promise<RealtimeChannel> {
  const stale = supabase.getChannels().filter((channel) => channel.subTopic === topic);
  await Promise.all(
    stale.map(async (channel) => {
      const status = await supabase.removeChannel(channel);
      // Fermeture non confirmée par le serveur (délai dépassé) : le canal resterait dans la liste du client.
      if (status !== 'ok') {
        channel.teardown();
      }
    })
  );
  return supabase.channel(topic, { config: { private: true } });
}
