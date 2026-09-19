import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Icônes proposées pour un objectif d'épargne.
 *
 * Une liste courte plutôt que tout le jeu d'icônes : on choisit en un coup d'œil, et chaque glyphe reste reconnaissable dans une pastille de 40 px.
 */
export const GOAL_ICONS: { name: IconName; label: string }[] = [
  { name: 'piggy-bank-outline', label: 'Tirelire' },
  { name: 'shield-check-outline', label: 'Urgence' },
  { name: 'airplane', label: 'Voyage' },
  { name: 'home-outline', label: 'Logement' },
  { name: 'car-outline', label: 'Voiture' },
  { name: 'bike', label: 'Vélo' },
  { name: 'laptop', label: 'Équipement' },
  { name: 'school-outline', label: 'Études' },
  { name: 'gift-outline', label: 'Cadeau' },
  { name: 'heart-outline', label: 'Santé' },
];

export const DEFAULT_GOAL_ICON: IconName = 'piggy-bank-outline';

/** La base n'impose pas la liste : un nom inconnu, écrit par une ancienne version de l'app, retombe sur la tirelire. */
export function goalIcon(name: string): IconName {
  return GOAL_ICONS.find((icon) => icon.name === name)?.name ?? DEFAULT_GOAL_ICON;
}
