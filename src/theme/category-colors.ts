/**
 * Couleur par catégorie.
 *
 * La couleur est un canal d'information, pas une décoration : une dépense d'alimentation se reconnaît à sa pastille orange avant qu'on ait lu le mot, et la même teinte suit la catégorie sur tous les écrans.
 *
 * Deux niveaux :
 * 1. les catégories par défaut sont mappées par leur icône, qui est stable — elle vient du seed et ne change pas quand on renomme une catégorie ;
 * 2. tout le reste, catégories personnalisées comprises, reçoit une teinte dérivée de son identifiant. Déterministe, donc stable d'un appareil à l'autre et d'une session à l'autre, sans colonne en base ni migration.
 *
 * Chaque teinte existe en clair et en sombre : un orange lisible sur papier devient illisible sur fond profond, et inversement.
 */

export type CategoryTone = {
  /** Icône et accents. Contraste suffisant pour du texte sur `surface`. */
  tint: string;
  /** Fond de la pastille. */
  surface: string;
};

type Tone = { light: CategoryTone; dark: CategoryTone };

const TONES = {
  orange: {
    light: { tint: '#D2481F', surface: '#FDE8E1' },
    dark: { tint: '#FF9166', surface: '#2A1913' },
  },
  blue: {
    light: { tint: '#1F5FE0', surface: '#DFE9FE' },
    dark: { tint: '#7FAAFF', surface: '#131C2E' },
  },
  violet: {
    light: { tint: '#7245E8', surface: '#EAE2FD' },
    dark: { tint: '#B79BFF', surface: '#1F1830' },
  },
  pink: {
    light: { tint: '#C42E7B', surface: '#FBE1EE' },
    dark: { tint: '#FF8FC4', surface: '#2B1522' },
  },
  red: {
    light: { tint: '#C4362B', surface: '#FCE3E0' },
    dark: { tint: '#FF8A7E', surface: '#2C1613' },
  },
  amber: {
    light: { tint: '#9A6B00', surface: '#FDF1D9' },
    dark: { tint: '#E8B84B', surface: '#2A2110' },
  },
  cyan: {
    light: { tint: '#0B6E80', surface: '#D8F1F5' },
    dark: { tint: '#5FCFE0', surface: '#0F2429' },
  },
  rose: {
    light: { tint: '#B03A5B', surface: '#FBE3E9' },
    dark: { tint: '#F58DA7', surface: '#2A171C' },
  },
  indigo: {
    light: { tint: '#3F45C7', surface: '#E2E4FB' },
    dark: { tint: '#9CA1FF', surface: '#181A2E' },
  },
  green: {
    light: { tint: '#0B8F6A', surface: '#D7F3E9' },
    dark: { tint: '#3DDC97', surface: '#0F2620' },
  },
  teal: {
    light: { tint: '#0A7A73', surface: '#D5F0EE' },
    dark: { tint: '#4FD4CA', surface: '#0E2523' },
  },
  slate: {
    light: { tint: '#5E6E69', surface: '#E3E9E7' },
    dark: { tint: '#8894A2', surface: '#1C242E' },
  },
} satisfies Record<string, Tone>;

type ToneName = keyof typeof TONES;

/** Ordre de repli pour les catégories personnalisées. */
const FALLBACK_ORDER: ToneName[] = [
  'blue',
  'violet',
  'amber',
  'pink',
  'cyan',
  'indigo',
  'rose',
  'teal',
  'orange',
  'green',
];

/**
 * Icônes du seed (20260904000300_seed_categories.sql). Les revenus prennent les verts, les dépenses se répartissent le reste ; les couleurs proches sont séparées pour rester distinguables au premier coup d'œil.
 */
const BY_ICON: Record<string, ToneName> = {
  cart: 'orange', // Alimentation
  home: 'blue', // Logement
  car: 'violet', // Transport
  'movie-open': 'pink', // Loisirs
  'heart-pulse': 'red', // Santé
  'silverware-fork-knife': 'amber', // Restaurants
  repeat: 'cyan', // Abonnements
  'tshirt-crew': 'rose', // Vêtements
  school: 'indigo', // Éducation
  'dots-horizontal': 'slate', // Divers
  cash: 'green', // Salaire
  'cash-refund': 'teal', // Remboursement
  gift: 'violet', // Cadeau
  'plus-circle': 'green', // Autres revenus
  // Catégories de la zone CFA (20260925000300_regional_categories.sql). Douze teintes pour dix-huit dépenses : certaines se partagent une couleur, en choisissant des catégories qui ne se suivent pas dans la grille, triée par nom.
  'account-group': 'teal', // Tontine
  'human-male-female-child': 'amber', // Famille
  'signal-cellular-3': 'cyan', // Crédit & data
  'transmission-tower': 'blue', // Eau & électricité
  'bank-transfer-out': 'slate', // Frais mobile money
  'party-popper': 'pink', // Cérémonies
  church: 'indigo', // Dons & église
  'handshake-outline': 'red', // Dettes
  'storefront-outline': 'green', // Commerce
  'bank-transfer-in': 'teal', // Transfert reçu
  'account-cash': 'green', // Tontine reçue
};

/** djb2, tronqué. Sert seulement à répartir des teintes, jamais à sécuriser. */
function hash(value: string): number {
  let acc = 5381;
  for (let i = 0; i < value.length; i += 1) {
    acc = ((acc << 5) + acc + value.charCodeAt(i)) >>> 0;
  }
  return acc;
}

export function categoryTone(
  category: { id: string; icon: string },
  isDark: boolean
): CategoryTone {
  const named = BY_ICON[category.icon];
  const tone = named ?? FALLBACK_ORDER[hash(category.id) % FALLBACK_ORDER.length];
  return TONES[tone][isDark ? 'dark' : 'light'];
}
