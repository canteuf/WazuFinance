import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Icônes proposées pour une catégorie personnalisée.
 *
 * Une liste courte, comme pour les objectifs d'épargne : on choisit en un coup d'œil, et chaque glyphe reste lisible dans une tuile de la grille.
 *
 * Aucune n'est une icône du seed (20260904000300_seed_categories.sql), et ce n'est pas un hasard : categoryTone() colore les catégories par défaut d'après leur icône. Une catégorie personnalisée qui reprendrait `gift` prendrait le violet de « Cadeau » ; avec une icône à elle, elle reçoit une teinte dérivée de son identifiant.
 */
export const CATEGORY_ICONS: { name: IconName; label: string }[] = [
  { name: 'tag-outline', label: 'Étiquette' },
  { name: 'shopping-outline', label: 'Achats' },
  { name: 'paw', label: 'Animaux' },
  { name: 'baby-carriage', label: 'Enfants' },
  { name: 'dumbbell', label: 'Sport' },
  { name: 'cellphone', label: 'Téléphone' },
  { name: 'lightning-bolt', label: 'Électricité' },
  { name: 'water', label: 'Eau' },
  { name: 'gas-station', label: 'Carburant' },
  { name: 'bus', label: 'Transports en commun' },
  { name: 'airplane', label: 'Voyage' },
  { name: 'hand-heart', label: 'Dons' },
  { name: 'briefcase-outline', label: 'Travail' },
  { name: 'hammer-wrench', label: 'Travaux' },
  { name: 'spa-outline', label: 'Beauté' },
  { name: 'book-open-variant', label: 'Livres' },
  { name: 'gamepad-variant-outline', label: 'Jeux' },
  { name: 'bank-outline', label: 'Banque' },
];

export const DEFAULT_CATEGORY_ICON: IconName = 'tag-outline';
