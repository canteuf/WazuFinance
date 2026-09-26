import { containsPattern } from '@/lib/search';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type TransactionWithCategory = Tables<'transactions'> & {
  category: { id: string; name: string; icon: string } | null;
};

const SELECT_WITH_CATEGORY = '*, category:categories(id, name, icon)';

/**
 * Dernières opérations du groupe sur une période, les plus récentes d'abord.
 *
 * Les bornes ne sont pas optionnelles : le reste du tableau de bord (solde, entrées, sorties, répartition) décrit une période, et une liste qui remonterait au-delà placerait le loyer du mois dernier sous « Solde de septembre ». Semi-ouvertes [from, to), comme partout ailleurs.
 *
 * Le tri reprend transactions_group_occurred_idx (group_id, occurred_on desc, id desc) : l'index couvre le filtre et l'ordre, et le départage par id rend la pagination de l'écran 3 stable quand plusieurs lignes partagent une date.
 */
export async function listRecent(
  groupId: string,
  limit: number,
  from: string,
  to: string
): Promise<TransactionWithCategory[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(SELECT_WITH_CATEGORY)
    .eq('group_id', groupId)
    .gte('occurred_on', from)
    .lt('occurred_on', to)
    .order('occurred_on', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data;
}

export async function getById(id: string): Promise<TransactionWithCategory> {
  const { data, error } = await supabase
    .from('transactions')
    .select(SELECT_WITH_CATEGORY)
    .eq('id', id)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export type CreateTransactionInput = {
  /** Identifiant tiré par l'app à l'ouverture du formulaire, pas par la base : c'est lui qui rend la création rejouable sans doublon (voir `create`). */
  id: string;
  groupId: string;
  userId: string;
  categoryId: string;
  type: Tables<'transactions'>['type'];
  amount: number;
  occurredOn: string;
  note: string | null;
  /**
   * Portefeuille de l'opération. `null` laisse la base choisir celui par défaut du groupe (assign_transaction_wallet()). Une saisie mise en file par une version de l'app antérieure aux portefeuilles n'a pas ce champ du tout : il arrive `undefined`, et vaut `null`.
   */
  walletId: string | null;
};

export type UpdateTransactionInput = Omit<CreateTransactionInput, 'id' | 'groupId' | 'userId'>;

/**
 * Crée une opération, sans doublon si la même saisie est envoyée deux fois.
 *
 * Une création peut atteindre la base sans que sa réponse revienne : réseau coupé juste après l'envoi, ou app tuée alors qu'une saisie en file partait — relue du disque au démarrage, elle est rejouée. L'utilisateur, de son côté, retouche « Enregistrer » après un « Pas de connexion ». Avec un id tiré par la base, chacun de ces renvois créait une seconde ligne, et la dépense comptait double.
 *
 * L'id vient donc de l'app, et l'écriture est un `insert … on conflict (id) do nothing` : un renvoi ne change rien, et la ligne déjà en base est relue pour être renvoyée comme si l'insertion venait d'avoir lieu. `do nothing` et non une fusion : une saisie rejouée des heures plus tard écraserait sinon ce qu'un autre membre a corrigé entre-temps.
 */
export async function create(
  input: CreateTransactionInput
): Promise<Tables<'transactions'>> {
  const { data, error } = await supabase
    .from('transactions')
    .upsert(
      {
        id: input.id,
        group_id: input.groupId,
        // La policy transactions_insert_member exige user_id = auth.uid() : cette valeur est vérifiée en base, pas seulement ici.
        user_id: input.userId,
        category_id: input.categoryId,
        type: input.type,
        amount: input.amount,
        occurred_on: input.occurredOn,
        note: input.note,
        wallet_id: input.walletId ?? null,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    )
    .select()
    .maybeSingle();

  if (error) {
    throw error;
  }

  // Aucune ligne renvoyée : l'id existait déjà, la saisie avait été enregistrée par un envoi précédent.
  return data ?? getById(input.id);
}

export async function update(
  id: string,
  patch: UpdateTransactionInput
): Promise<Tables<'transactions'>> {
  const { data, error } = await supabase
    .from('transactions')
    .update({
      category_id: patch.categoryId,
      type: patch.type,
      amount: patch.amount,
      occurred_on: patch.occurredOn,
      note: patch.note,
      // Absent d'une modification mise en file avant les portefeuilles : on ne touche alors pas à celui de la ligne.
      ...(patch.walletId === undefined ? {} : { wallet_id: patch.walletId }),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function remove(id: string): Promise<void> {
  // .select().single() force une erreur si RLS a filtré la ligne cible (id erroné, appartenance périmée) : sans lui, zéro ligne supprimée serait encore un succès silencieux, contrairement à update().
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .select('id')
    .single();

  if (error) {
    throw error;
  }
}

export type TransactionFilters = {
  /** Bornes de date, `null` des deux côtés pour « Tout ». */
  from: string | null;
  to: string | null;
  categoryId: string | null;
  type: Tables<'transactions'>['type'] | null;
  /** Déjà passé par `normalizeSearch` : `null` quand il n'y a rien à chercher. */
  search: string | null;
};

/** Dernière ligne rendue par la page précédente. */
export type TransactionCursor = {
  occurredOn: string;
  id: string;
};

/**
 * Une page de l'historique, les plus récentes d'abord.
 *
 * La pagination porte sur le couple `(occurred_on, id)` et non sur un décalage. Avec `.range()`, une insertion entre deux pages décale toutes les suivantes et fait apparaître une ligne deux fois ; une suppression en saute une. Le Realtime insérant pendant le défilement, ce n'est pas une hypothèse.
 *
 * L'invariant est couvert par supabase/tests/transaction_paging_test.sql, dont les fixtures partagent volontairement une date : c'est le seul cas où le départage par `id` compte.
 */
export async function listPage(
  groupId: string,
  filters: TransactionFilters,
  cursor: TransactionCursor | null,
  limit: number
): Promise<TransactionWithCategory[]> {
  let query = supabase
    .from('transactions')
    .select(SELECT_WITH_CATEGORY)
    .eq('group_id', groupId);

  // Bornes semi-ouvertes, comme period_summary : la borne haute est exclue, ce qui supprime la classe de bugs « 30 ou 31 jours ».
  if (filters.from !== null) {
    query = query.gte('occurred_on', filters.from);
  }
  if (filters.to !== null) {
    query = query.lt('occurred_on', filters.to);
  }
  if (filters.categoryId !== null) {
    query = query.eq('category_id', filters.categoryId);
  }
  if (filters.type !== null) {
    query = query.eq('type', filters.type);
  }
  if (filters.search !== null) {
    // Jokers échappés : même sens que le `strpos` de daily_totals(), pour que la liste et les totaux par jour décrivent les mêmes lignes.
    query = query.ilike('note', containsPattern(filters.search));
  }

  if (cursor !== null) {
    // PostgREST n'exprime pas la comparaison de couples `(a, b) < (c, d)` : ce `or` produit le même prédicat. Les deux valeurs viennent d'une ligne déjà renvoyée par le serveur, jamais d'une saisie.
    query = query.or(
      `occurred_on.lt.${cursor.occurredOn},` +
        `and(occurred_on.eq.${cursor.occurredOn},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query
    .order('occurred_on', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data;
}

/** 1000 : le plafond de lignes par requête de PostgREST sur Supabase. Une page plus grande serait tronquée en silence et la boucle s'arrêterait trop tôt. */
const EXPORT_PAGE_SIZE = 1000;

/**
 * Toutes les opérations des filtres, pour l'export : la même requête que l'historique, parcourue page par page avec le même curseur, jusqu'à épuisement. Aucun second endroit où les filtres seraient traduits en SQL — le fichier contient exactement les lignes que l'écran liste.
 */
export async function listAllForExport(
  groupId: string,
  filters: TransactionFilters
): Promise<TransactionWithCategory[]> {
  const rows: TransactionWithCategory[] = [];
  let cursor: TransactionCursor | null = null;

  for (;;) {
    const page = await listPage(groupId, filters, cursor, EXPORT_PAGE_SIZE);
    rows.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) {
      return rows;
    }
    const last = page[page.length - 1];
    cursor = { occurredOn: last.occurred_on, id: last.id };
  }
}

export type DailyTotal = {
  /** Solde signé du jour : entrées positives, sorties négatives. Sommé par Postgres. */
  total: number;
  count: number;
};

/**
 * Totaux par jour pour les filtres affichés, sur toutes les opérations du jour — chargées dans la liste ou non : un jour à cheval sur deux pages garde un total juste.
 *
 * Indexés par date ISO, comme `occurred_on` : l'écran les rapproche des en-têtes de jour sans rien recalculer.
 */
export async function getDailyTotals(
  groupId: string,
  filters: TransactionFilters
): Promise<Map<string, DailyTotal>> {
  const { data, error } = await supabase.rpc('daily_totals', {
    p_group_id: groupId,
    // `undefined` et non `null` : l'argument est alors omis, et la valeur par défaut de la fonction — pas de filtre — s'applique.
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_type: filters.type ?? undefined,
    p_category_id: filters.categoryId ?? undefined,
    p_search: filters.search ?? undefined,
  });

  if (error) {
    throw error;
  }

  return new Map(
    data.map((row) => [row.occurred_on, { total: Number(row.total), count: row.tx_count }])
  );
}

/** Montants que l'utilisateur saisit le plus souvent dans ce groupe pour ce type, du plus fréquent au moins fréquent. */
export async function getFrequentAmounts(
  groupId: string,
  type: Tables<'transactions'>['type']
): Promise<number[]> {
  const { data, error } = await supabase.rpc('frequent_amounts', {
    p_group_id: groupId,
    p_type: type,
  });

  if (error) {
    throw error;
  }

  return data.map((row) => Number(row.amount));
}
