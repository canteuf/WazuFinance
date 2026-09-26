import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type ActivityEntry = Tables<'activity_log'>;

/** Dernière entrée rendue par la page précédente. */
export type ActivityCursor = {
  /** Tel que PostgREST l'a rendu — jamais repassé par `Date`. */
  occurredAt: string;
  id: string;
};

/**
 * Une page du journal du groupe, les plus récentes d'abord.
 *
 * Même règle que listPage() de l'historique, pour la même raison : la pagination porte sur le couple `(occurred_at, id)`, jamais sur un décalage. Une entrée écrite pendant le défilement décalerait toutes les pages suivantes d'un `OFFSET`.
 *
 * `occurredAt` garde les microsecondes que rend Postgres. Un aller-retour par `Date` les tronquerait à la milliseconde, et la comparaison `lt` sauterait ou répéterait une entrée.
 *
 * Les valeurs d'horodatage sont entre guillemets : `.`, `:` et `+` sont des caractères réservés dans l'arbre `or` de PostgREST. Le client encode les guillemets dans l'URL.
 */
export async function listActivityPage(
  groupId: string,
  cursor: ActivityCursor | null,
  limit: number
): Promise<ActivityEntry[]> {
  let query = supabase.from('activity_log').select('*').eq('group_id', groupId);

  if (cursor !== null) {
    // PostgREST n'exprime pas la comparaison de couples `(a, b) < (c, d)` : ce `or` produit le même prédicat. Les deux valeurs viennent d'une ligne déjà renvoyée par le serveur, jamais d'une saisie.
    query = query.or(
      `occurred_at.lt."${cursor.occurredAt}",` +
        `and(occurred_at.eq."${cursor.occurredAt}",id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data;
}

/** Le plafond de lignes par requête de PostgREST sur Supabase, comme pour l'export des opérations. */
const EXPORT_PAGE_SIZE = 1000;

/** Tout le journal du groupe, pour l'export : la même requête que l'écran, parcourue avec le même curseur jusqu'au bout. */
export async function listAllActivity(groupId: string): Promise<ActivityEntry[]> {
  const entries: ActivityEntry[] = [];
  let cursor: ActivityCursor | null = null;

  for (;;) {
    const page = await listActivityPage(groupId, cursor, EXPORT_PAGE_SIZE);
    entries.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) {
      return entries;
    }
    const last = page[page.length - 1];
    cursor = { occurredAt: last.occurred_at, id: last.id };
  }
}
