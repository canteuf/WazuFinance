import { useMutation } from '@tanstack/react-query';

import { listFormerMembers, listGroupMembers } from '@/data/groups';
import { getFilteredTotals } from '@/data/summary';
import { listAllForExport, type TransactionFilters } from '@/data/transactions';
import { useActiveGroup } from '@/hooks/use-active-group';
import { buildTransactionsCsv, exportFileName, type ExportRow } from '@/lib/csv';
import { departedAuthorName } from '@/lib/members';
import { buildTransactionsReportHtml } from '@/lib/pdf-report';
import { saveHtmlAsPdf, saveTextFile } from '@/lib/save-file';

export type ExportFormat = 'csv' | 'pdf';

export type ExportRequest = {
  format: ExportFormat;
  filters: TransactionFilters;
  /** Période et filtres déjà rédigés par l'écran, qui possède les libellés affichés dans sa barre de filtres. */
  periodLabel: string;
  filtersLabel: string;
};

// Hissé au niveau du module, comme les formateurs de src/lib/dates.ts.
const editedAtFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
});

/**
 * Export des opérations du groupe actif, pour les filtres affichés, en CSV ou en PDF.
 *
 * Une mutation plutôt qu'une requête : l'export est une action ponctuelle, rien à garder en cache, et `isPending` suffit à l'écran pour désactiver le bouton pendant la préparation.
 *
 * L'auteur vient de listGroupMembers() et non d'une jointure sur `users` : la policy `users_select_self_or_covisible` ne montre que les membres actuels. Un membre parti est nommé par `former_members`, un compte supprimé par le nom resté sur la ligne (`author_name`).
 *
 * Les totaux du relevé viennent de filtered_totals(), sommés par Postgres : les additionner ici passerait par des flottants binaires.
 */
export function useExportTransactions() {
  const { activeGroup } = useActiveGroup();

  return useMutation({
    mutationFn: async ({ format, filters, periodLabel, filtersLabel }: ExportRequest) => {
      if (!activeGroup) {
        throw new Error('Aucun groupe actif.');
      }

      const [transactions, members, former] = await Promise.all([
        listAllForExport(activeGroup.groupId, filters),
        listGroupMembers(activeGroup.groupId),
        activeGroup.isPersonal ? Promise.resolve([]) : listFormerMembers(activeGroup.groupId),
      ]);
      // Les anciens membres d'abord, les membres actuels ensuite : quelqu'un qui est revenu garde son nom actuel.
      const names = new Map([
        ...former.map((member) => [member.userId, departedAuthorName(member.displayName)] as const),
        ...members.map((member) => [member.userId, member.displayName] as const),
      ]);

      const rows: ExportRow[] = transactions.map((transaction) => ({
        occurredOn: transaction.occurred_on,
        type: transaction.type,
        amount: transaction.amount,
        // Une opération d'épargne ou de dette n'a pas de catégorie ; « Sans catégorie » la ferait passer pour un oubli.
        categoryName: transaction.is_savings
          ? 'Épargne'
          : transaction.debt_id !== null
            ? 'Prêt ou dette'
            : (transaction.category?.name ?? null),
        note: transaction.note,
        authorName:
          transaction.user_id === null
            ? departedAuthorName(transaction.author_name)
            : (names.get(transaction.user_id) ?? null),
      }));

      const name = exportFileName(activeGroup.name, filters.from, filters.to, format);

      if (format === 'csv') {
        await saveTextFile(name, buildTransactionsCsv(rows), 'text/csv');
        return rows.length;
      }

      const totals = await getFilteredTotals(activeGroup.groupId, filters);
      const html = buildTransactionsReportHtml({
        groupName: activeGroup.name,
        periodLabel,
        filtersLabel,
        generatedAt: editedAtFormatter.format(new Date()),
        totals,
        rows,
      });
      await saveHtmlAsPdf(name, html);
      return rows.length;
    },
  });
}
