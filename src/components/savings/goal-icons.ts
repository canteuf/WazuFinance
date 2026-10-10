import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Icônes proposées pour un objectif d'épargne.
 *
 * Une liste choisie plutôt que tout le jeu d'icônes : chaque glyphe reste reconnaissable dans une pastille de 40 px, et l'on trouve le sien sans chercher. Elle couvre ce qu'on met réellement de côté en zone CFA — terrain, construction, mariage, naissance, rentrée scolaire, boutique et stock, élevage, panneau solaire — et pas seulement le voyage et la voiture. Rangée par thème, ce que la grille garde (elle remplit les rangées dans l'ordre). Une seule icône pour la foi, sans en privilégier aucune.
 *
 * On peut en ajouter librement : la base n'impose pas la liste. Ne jamais en retirer ni en renommer une, en revanche : le nom est enregistré dans les objectifs existants, qui retomberaient sur la tirelire.
 */
export const GOAL_ICONS: { name: IconName; label: string }[] = [
  // Mettre de côté
  { name: 'piggy-bank-outline', label: 'Tirelire' },
  { name: 'shield-check-outline', label: 'Urgence' },
  { name: 'chart-line', label: 'Placement' },
  { name: 'cash-refund', label: 'Rembourser une dette' },
  // Maison
  { name: 'home-outline', label: 'Logement' },
  { name: 'land-fields', label: 'Terrain' },
  { name: 'home-roof', label: 'Construction' },
  { name: 'sofa-outline', label: 'Meubles' },
  { name: 'fridge-outline', label: 'Électroménager' },
  { name: 'television', label: 'Téléviseur' },
  { name: 'solar-power', label: 'Panneau solaire' },
  // Se déplacer
  { name: 'car-outline', label: 'Voiture' },
  { name: 'motorbike', label: 'Moto' },
  { name: 'bike', label: 'Vélo' },
  { name: 'airplane', label: 'Voyage' },
  // S'équiper
  { name: 'cellphone', label: 'Téléphone' },
  { name: 'laptop', label: 'Ordinateur' },
  { name: 'tools', label: 'Outils' },
  // Activité
  { name: 'storefront-outline', label: 'Boutique' },
  { name: 'package-variant-closed', label: 'Stock' },
  { name: 'cow', label: 'Élevage' },
  { name: 'sprout', label: 'Agriculture' },
  // Famille et grands moments
  { name: 'ring', label: 'Mariage' },
  { name: 'baby-carriage', label: 'Naissance' },
  { name: 'human-male-female-child', label: 'Famille' },
  { name: 'school-outline', label: 'Études' },
  { name: 'bag-personal-outline', label: 'Rentrée scolaire' },
  { name: 'party-popper', label: 'Fête' },
  { name: 'gift-outline', label: 'Cadeau' },
  { name: 'tshirt-crew-outline', label: 'Vêtements' },
  { name: 'diamond-stone', label: 'Bijoux' },
  // Santé, foi, repos
  { name: 'heart-outline', label: 'Santé' },
  { name: 'hospital-box-outline', label: 'Soins' },
  { name: 'hands-pray', label: 'Foi, pèlerinage' },
  { name: 'beach', label: 'Vacances' },
];

export const DEFAULT_GOAL_ICON: IconName = 'piggy-bank-outline';

/** La base n'impose pas la liste : un nom inconnu, écrit par une ancienne version de l'app, retombe sur la tirelire. */
export function goalIcon(name: string): IconName {
  return GOAL_ICONS.find((icon) => icon.name === name)?.name ?? DEFAULT_GOAL_ICON;
}
