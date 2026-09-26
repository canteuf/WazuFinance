import { joinCodeFromPath } from '@/lib/join-link';
import { setPendingInvite } from '@/lib/pending-invite';

/**
 * Réécrit les liens entrants avant que le routeur ne les lise.
 *
 * `wazufinance://join/CODE` ne correspond à aucune route : le code est mis de côté et l'app s'ouvre sur son accueil. `usePendingInvite()` ouvre ensuite « Rejoindre », pré-rempli, dès qu'un compte est connecté. Une route `join/[code]` n'aurait pas suffi : sans session, les gardes du layout racine la rendent inaccessible, et le code serait perdu pendant l'inscription.
 */
export async function redirectSystemPath({ path }: { path: string; initial: boolean }): Promise<string> {
  const code = joinCodeFromPath(path);
  if (code === null) {
    return path;
  }
  await setPendingInvite(code);
  return '/';
}
