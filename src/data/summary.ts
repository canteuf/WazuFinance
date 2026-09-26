import { filterArgs, type TransactionFilters } from '@/data/transactions';
import { supabase } from '@/lib/supabase';
import type { TransactionType } from '@/types/database';

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
 * Distinct de getPeriodSummary() : celui-ci exige des bornes et ignore les autres filtres. `filtered_totals` lit les lignes de `filtered_transactions()`, comme `daily_totals` : le relevé et l'historique décrivent les mêmes lignes.
 */
export async function getFilteredTotals(
  groupId: string,
  filters: TransactionFilters
): Promise<PeriodSummary> {
  const { data, error } = await supabase.rpc('filtered_totals', filterArgs(groupId, filters)).single();

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

export type CategorySubtotal = {
  /** `null` pour les opérations sans catégorie : épargne, prêts et dettes. */
  categoryId: string | null;
  name: string | null;
  type: TransactionType;
  total: number;
  count: number;
};

/**
 * Sous-totaux par catégorie des opérations filtrées, dépenses puis revenus, pour le relevé PDF. Mêmes lignes que `getFilteredTotals` : leur somme retombe sur ses totaux.
 */
export async function getFilteredCategoryTotals(
  groupId: string,
  filters: TransactionFilters
): Promise<CategorySubtotal[]> {
  const { data, error } = await supabase.rpc('filtered_category_totals', filterArgs(groupId, filters));

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    categoryId: row.category_id,
    name: row.name,
    type: row.type,
    total: Number(row.total),
    count: Number(row.tx_count),
  }));
}

export type CommerceSummary = {
  /** Revenus « Commerce », versements des ventes à crédit compris. */
  sales: number;
  /** Dépenses « Achat de stock ». */
  stock: number;
  /** Ventes moins stock, soustrait en base. */
  margin: number;
  /** Nombre d'opérations de commerce de la période : zéro, la carte ne s'affiche pas. */
  count: number;
};

/** Ventes et achats de stock de la période, sommés en base. Voir commerce_summary(). */
export async function getCommerceSummary(
  groupId: string,
  from: string,
  to: string
): Promise<CommerceSummary> {
  const { data, error } = await supabase
    .rpc('commerce_summary', { p_group_id: groupId, p_from: from, p_to: to })
    .single();

  if (error) {
    throw error;
  }

  return {
    sales: Number(data.sales),
    stock: Number(data.stock),
    margin: Number(data.margin),
    count: Number(data.tx_count),
  };
}
