import { useMutation } from '@tanstack/react-query';

import { listAllActivity } from '@/data/activity';
import { useActiveGroup } from '@/hooks/use-active-group';
import {
  formatActivity,
  formatActivityDate,
  type ActivityContext,
  type CategoryName,
} from '@/lib/activity-format';
import { buildActivityReportHtml } from '@/lib/activity-report';
import { fileSlug } from '@/lib/csv';
import { saveHtmlAsPdf } from '@/lib/save-file';

const generatedAtFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

export type ActivityExportRequest = {
  currentUserId: string | null;
  categories: readonly CategoryName[];
  context: ActivityContext;
};

/**
 * Journal complet du groupe actif en PDF. Une mutation, comme l'export des opérations : une action ponctuelle, rien à garder en cache.
 *
 * Les noms des catégories, des personnes et des portefeuilles viennent de l'écran, qui les a déjà chargés pour afficher le fil : le document est rédigé par la même fonction, avec les mêmes données.
 */
export function useExportActivity() {
  const { activeGroup } = useActiveGroup();

  return useMutation({
    mutationFn: async ({ currentUserId, categories, context }: ActivityExportRequest) => {
      if (!activeGroup) {
        throw new Error('Aucun groupe actif.');
      }
      const entries = await listAllActivity(activeGroup.groupId);
      const html = buildActivityReportHtml({
        groupName: activeGroup.name,
        generatedAt: generatedAtFormatter.format(new Date()),
        lines: entries.map((entry) => ({
          when: formatActivityDate(entry.occurred_at),
          sentence: formatActivity(entry, currentUserId, categories, context),
        })),
      });
      await saveHtmlAsPdf(`wazu-${fileSlug(activeGroup.name)}-journal.pdf`, html);
      return entries.length;
    },
  });
}
