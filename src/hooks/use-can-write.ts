import { useActiveGroup } from '@/hooks/use-active-group';

/**
 * Faux quand l'utilisateur est lecteur du groupe actif : il consulte tout, mais aucun bouton d'ajout ni lien vers un formulaire ne lui est proposé.
 *
 * C'est l'écran qui suit la base, pas l'inverse : guard_viewer_write() refuse de toute façon ses écritures (migration group_roles). Cacher les gestes lui évite seulement d'ouvrir un formulaire qu'il ne pourrait pas enregistrer.
 */
export function useCanWrite(): boolean {
  const { activeGroup } = useActiveGroup();
  return activeGroup?.role !== 'viewer';
}
