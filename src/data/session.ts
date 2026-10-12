import { SESSION_MISMATCH, SESSION_PENDING_MESSAGE } from '@/lib/data-errors';
import { supabase } from '@/lib/supabase';

/** Codes PostgREST d'un jeton refusé : invalide (PGRST301) ou expiré (PGRST303). */
const REJECTED_TOKEN_CODES = new Set(['PGRST301', 'PGRST303']);

function pendingSession(): Error {
  // Sans code : isTransportError() la reconnaît à son message, et la file la renvoie plus tard comme une coupure de réseau.
  return Object.assign(new Error(SESSION_PENDING_MESSAGE), { code: '' });
}

/**
 * Exécute une écriture de la file hors ligne sous la session de son auteur, et seulement elle.
 *
 * Sans session utilisable — jeton expiré pendant une longue coupure et premier rafraîchissement raté sur une 2G instable —, supabase-js envoyait la requête avec la seule clé anonyme : la base répondait 42501, l'écriture sortait de la file comme un refus définitif, puis la suivante, jusqu'à vider la file d'une matinée de ventes (prouvé avec supabase-js 2.115). L'écriture attend désormais, comme sur une coupure. Un jeton que PostgREST juge expiré (horloge du téléphone en retard) déclenche un rafraîchissement, puis le même renvoi.
 *
 * `expectedUserId` est l'auteur, gardé dans le `meta` de la mutation et écrit avec elle sur le disque. Une écriture qui attendait son prochain essai survit en mémoire à un changement de compte : sous un autre compte, elle est abandonnée sans bruit (SESSION_MISMATCH) au lieu de s'exécuter au nom de quelqu'un d'autre ; sa copie sur le disque, dans le cache de son auteur, repartira à sa prochaine connexion. Absent — écriture mise en file par une version antérieure —, seule la présence d'une session est exigée.
 */
export async function withWriteSession<T>(expectedUserId: unknown, write: () => Promise<T>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) {
    throw pendingSession();
  }
  if (typeof expectedUserId === 'string' && session.user.id !== expectedUserId) {
    throw Object.assign(new Error('Écriture d’un autre compte'), { code: SESSION_MISMATCH });
  }

  try {
    return await write();
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && REJECTED_TOKEN_CODES.has(code)) {
      await supabase.auth.refreshSession().catch(() => undefined);
      throw pendingSession();
    }
    throw error;
  }
}
