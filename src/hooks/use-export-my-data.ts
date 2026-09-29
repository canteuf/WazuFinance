import { useMutation } from '@tanstack/react-query';

import { exportMyData } from '@/data/account';
import { todayIso } from '@/lib/dates';
import { saveTextFile } from '@/lib/save-file';

/**
 * Télécharge toutes les données du compte en un fichier JSON, partagé comme les relevés (droit d'accès et portabilité promis par la politique de confidentialité, section 9).
 *
 * Une mutation, comme les autres exports : une action ponctuelle, rien à garder en cache. Le fichier commence par `wazu-`, donc `clearExportedFiles()` l'efface à la déconnexion.
 */
export function useExportMyData() {
  return useMutation({
    mutationFn: async () => {
      const data = await exportMyData();
      await saveTextFile(
        `wazu-mes-donnees-${todayIso()}.json`,
        JSON.stringify(data, null, 2),
        'application/json',
        'Exporter mes données'
      );
    },
  });
}
