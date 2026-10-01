/**
 * Ce que porte une catégorie, dit en clair : sur la liste des catégories, et avant d'en supprimer une.
 */

export type CategoryUsageCounts = {
  transactions: number;
  budgets: number;
  recurring: number;
};

/** « 12 opérations · un budget · 1 récurrente », ou `null` tant que le compte n'est pas arrivé : un « Aucune opération » provisoire se lirait comme une catégorie qu'on peut supprimer sans risque. */
export function usageLabel(usage: CategoryUsageCounts | undefined): string | null {
  if (!usage) {
    return null;
  }
  const parts = [
    usage.transactions === 0
      ? 'Aucune opération'
      : usage.transactions === 1
        ? '1 opération'
        : `${usage.transactions} opérations`,
  ];
  if (usage.budgets > 0) {
    parts.push(usage.budgets === 1 ? 'un budget' : `${usage.budgets} budgets`);
  }
  if (usage.recurring > 0) {
    parts.push(usage.recurring === 1 ? '1 récurrente' : `${usage.recurring} récurrentes`);
  }
  return parts.join(' · ');
}

/** Une remplaçante est demandée dès qu'il y a quelque chose à reporter : des opérations ou des modèles récurrents. Un budget ne se reporte pas (voir 20260930000100_category_management.sql). */
export function needsReplacement(usage: CategoryUsageCounts): boolean {
  return usage.transactions > 0 || usage.recurring > 0;
}

/**
 * Ce que la suppression va faire, en une phrase, ou `null` quand elle n'emporte rien. `replacementName` : la catégorie choisie pour recevoir les opérations, s'il y en a une.
 */
export function deletionSummary(usage: CategoryUsageCounts, replacementName: string | null): string | null {
  const sentences: string[] = [];
  const moved = [
    usage.transactions > 0
      ? usage.transactions === 1
        ? 'son opération'
        : `ses ${usage.transactions} opérations`
      : null,
    usage.recurring > 0
      ? usage.recurring === 1
        ? 'son opération récurrente'
        : `ses ${usage.recurring} opérations récurrentes`
      : null,
  ].filter((part): part is string => part !== null);

  if (moved.length > 0) {
    const what = moved.join(' et ');
    sentences.push(
      replacementName
        ? `${capitalize(what)} ${plural(usage) ? 'passeront' : 'passera'} dans « ${replacementName} ».`
        : `Choisissez la catégorie qui recevra ${what}.`
    );
  }
  if (usage.budgets > 0) {
    sentences.push(usage.budgets === 1 ? 'Son budget sera supprimé.' : 'Ses budgets seront supprimés.');
  }
  return sentences.length > 0 ? sentences.join(' ') : null;
}

function plural(usage: CategoryUsageCounts): boolean {
  return usage.transactions + usage.recurring > 1;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
