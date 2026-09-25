import type { TransactionFilters } from '@/data/transactions';
import { supabase } from '@/lib/supabase';

export type PeriodSummary = {
  /** Entrées hors retraits d'épargne. */
  income: number;
  /** Sorties hors versements d'épargne. */
  expense: number;
  /** Épargne nette de la période : versements moins retraits. Négative quand on a plus retiré que versé. */
  savings: number;
  /** Prêts et dettes de la période, signés comme une entrée : positif quand ils ont fait entrer plus d'argent qu'ils n'en ont fait sortir (emprunt, remboursement reçu). */
  debts: number;
  /** Tout ce qui entre moins tout ce qui sort : `income − expense − savings + debts`, calculé en base. */
  balance: number;
  /** Nombre d'écritures de la période, entrées et sorties confondues. */
  txCount: number;
};

/**
 * Totaux de la période budgétaire, sommés par Postgres.
 *
 * La base stocke du `numeric(12,2)`, que Postgres additionne exactement. Rapatrier les lignes pour les additionner en JavaScript passerait par des flottants binaires : sur des montants, l'écart d'un centime qui apparaît et disparaît selon les lignes ne se retrouve jamais.
 *
 * Les bornes sont calculées par l'appelant à partir de la date locale de l'appareil : le serveur est en UTC et se tromperait de période pendant les premières heures du jour de bascule.
 */
export async function getPeriodSummary(
  groupId: string,
  from: string,
  to: string
): Promise<PeriodSummary> {
  const { data, error } = await supabase
    .rpc('period_summary', { p_group_id: groupId, p_from: from, p_to: to })
    .single();

  if (error) {
    throw error;
  }

  // Un `numeric` traverse PostgREST sans garantie d'arriver en nombre JSON. Number() n'est appliqué qu'une fois par total, jamais dans une boucle d'addition : la somme exacte a déjà été faite en base.
  return {
    income: Number(data.income),
    expense: Number(data.expense),
    savings: Number(data.savings),
    debts: Number(data.debts),
    balance: Number(data.balance),
    // count(*) est coulé en integer côté base, donc il arrive déjà en nombre JSON — Number() ne sert ici qu'à ne pas faire d'exception dans la lecture.
    txCount: Number(data.tx_count),
  };
}

export type CategorySlice = {
  categoryId: string;
  name: string;
  icon: string;
  total: number;
};

/**
 * Répartition des dépenses par catégorie sur la période (spec 2.6).
 *
 * Déjà triée par total décroissant côté base : c'est l'ordre d'affichage, et le trier ici obligerait chaque écran à le refaire.
 *
 * Les revenus sont exclus et les transactions sans catégorie n'y figurent pas. Le total des sorties reste donc `getPeriodSummary().expense`, qui peut dépasser la somme des parts — c'est voulu, et l'affichage doit s'appuyer sur la somme des parts pour ses proportions, jamais sur `expense`.
 */
export async function getCategoryBreakdown(
  groupId: string,
  from: string,
  to: string
): Promise<CategorySlice[]> {
  const { data, error } = await supabase.rpc('category_breakdown', {
    p_group_id: groupId,
    p_from: from,
    p_to: to,
  });

  if (error) {
    throw error;
  }

  // Même raison que dans getPeriodSummary : un numeric traverse PostgREST sans garantie d'arriver en nombre JSON. La somme exacte a déjà été faite en base.
  return data.map((row) => ({
    categoryId: row.category_id,
    name: row.name,
    icon: row.icon,
    total: Number(row.total),
  }));
}

/**
 * Totaux des opérations sous les filtres de l'historique, pour l'en-tête du relevé exporté.
 *
 * Distinct de getPeriodSummary() : celui-ci exige des bornes et ignore catégorie, type et recherche. La fonction `filtered_totals` partage sa clause where avec `daily_totals`, donc le relevé et l'historique décrivent les mêmes lignes.
 */
export async function getFilteredTotals(
  groupId: string,
  filters: TransactionFilters
): Promise<PeriodSummary> {
  const { data, error } = await supabase
    .rpc('filtered_totals', {
      p_group_id: groupId,
      // `undefined` et non `null` : l'argument est alors omis, et la valeur par défaut — pas de filtre — s'applique.
      p_from: filters.from ?? undefined,
      p_to: filters.to ?? undefined,
      p_type: filters.type ?? undefined,
      p_category_id: filters.categoryId ?? undefined,
      p_search: filters.search ?? undefined,
    })
    .single();

  if (error) {
    throw error;
  }

  // Même raison que getPeriodSummary : un numeric traverse PostgREST sans garantie d'arriver en nombre JSON, et la somme exacte a déjà été faite en base.
  return {
    income: Number(data.income),
    expense: Number(data.expense),
    savings: Number(data.savings),
    debts: Number(data.debts),
    balance: Number(data.balance),
    txCount: Number(data.tx_count),
  };
}
