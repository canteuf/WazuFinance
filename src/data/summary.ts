import { supabase } from '@/lib/supabase';

export type PeriodSummary = {
  income: number;
  expense: number;
  balance: number;
};

/**
 * Totaux de la période budgétaire, sommés par Postgres.
 *
 * La base stocke du `numeric(12,2)`, que Postgres additionne exactement.
 * Rapatrier les lignes pour les additionner en JavaScript passerait par des
 * flottants binaires : sur des montants, l'écart d'un centime qui apparaît et
 * disparaît selon les lignes ne se retrouve jamais.
 *
 * Les bornes sont calculées par l'appelant à partir de la date locale de
 * l'appareil : le serveur est en UTC et se tromperait de période pendant les
 * premières heures du jour de bascule.
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

  // Un `numeric` traverse PostgREST sans garantie d'arriver en nombre JSON.
  // Number() n'est appliqué qu'une fois par total, jamais dans une boucle
  // d'addition : la somme exacte a déjà été faite en base.
  return {
    income: Number(data.income),
    expense: Number(data.expense),
    balance: Number(data.balance),
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
 * Déjà triée par total décroissant côté base : c'est l'ordre d'affichage, et
 * le trier ici obligerait chaque écran à le refaire.
 *
 * Les revenus sont exclus et les transactions sans catégorie n'y figurent pas.
 * Le total des sorties reste donc `getPeriodSummary().expense`, qui peut
 * dépasser la somme des parts — c'est voulu, et l'affichage doit s'appuyer sur
 * la somme des parts pour ses proportions, jamais sur `expense`.
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

  // Même raison que dans getPeriodSummary : un numeric traverse PostgREST sans
  // garantie d'arriver en nombre JSON. La somme exacte a déjà été faite en base.
  return data.map((row) => ({
    categoryId: row.category_id,
    name: row.name,
    icon: row.icon,
    total: Number(row.total),
  }));
}
