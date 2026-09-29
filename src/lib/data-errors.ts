/**
 * Messages français pour les erreurs de données.
 *
 * On mappe d'abord les codes SQLSTATE, qui ne changent pas entre versions de Postgres et de PostgREST — même règle que src/lib/auth-errors.ts. Une panne de transport (connexion perdue) ne porte jamais de SQLSTATE : le client PostgREST installé l'attrape et renvoie un objet littéral avec `code: ""` et un `message` du type `"TypeError: Network request failed"` (React Native) ou `"TypeError: Failed to fetch"` (navigateur). Pour ce seul cas on retombe sur le message, faute d'alternative : le code reste prioritaire dès qu'il est renseigné.
 */

import { TIMEOUT_MESSAGE, UNAVAILABLE_MESSAGE } from '@/lib/fetch-with-timeout';

/** Code d'une opération enregistrée dont la récurrence a été refusée : elle n'est pas perdue, et ne doit pas se lire comme telle. */
export const RECURRENCE_FAILED = 'RECURRENCE_FAILED';

const MESSAGES: Record<string, string> = {
  '42501': "Vous n'avez pas accès à ce budget.",
  '23503': "Cette catégorie n'existe plus.",
  '23514': 'Montant invalide.',
  // Formulation neutre : ce code sert désormais aux budgets, dont le triplet (group_id, category_id, period) est unique. Les transactions, elles, n'ont aucune contrainte d'unicité — ce message n'a jamais pu s'y afficher.
  '23505': 'Un enregistrement identique existe déjà.',
  PGRST116: 'Cette opération est introuvable.',
  // Pas un SQLSTATE : le code `INVITATION_REJECTED` que `joinGroupWithCode` donne au refus d'une invitation, que la base signale par un NULL (voir src/data/groups.ts). Un seul message pour tous les cas, comme la base.
  INVITATION_REJECTED: 'Code invalide ou expiré. Demandez un nouveau code au propriétaire du groupe.',
  // Pas un SQLSTATE non plus : `update()` (src/data/transactions.ts) le lève quand la ligne a changé depuis que le formulaire l'a lue.
  TRANSACTION_CONFLICT:
    'Cette opération a été modifiée par un autre membre entre-temps. Rouvrez-la pour voir sa version actuelle, puis refaites votre modification.',
  // Levé par l'écriture d'une opération « Répéter » (use-transaction-mutations) quand l'opération est passée mais que son modèle récurrent a été refusé.
  [RECURRENCE_FAILED]: 'L’opération est enregistrée, mais sa répétition n’a pas pu être créée.',
};

const GENERIC = 'Une erreur inattendue est survenue.';

// Les deux derniers viennent de fetch-with-timeout.ts : une requête restée sans réponse, et une passerelle momentanément indisponible (502, 503…).
const NETWORK_MESSAGE_PATTERNS = ['Network request failed', 'Failed to fetch', TIMEOUT_MESSAGE, UNAVAILABLE_MESSAGE];

function hasCode(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    (error as { code: string }).code !== ''
  );
}

function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

/**
 * Vrai pour une panne de transport — la requête n'a pas eu de réponse —, faux pour tout refus de la base, qui porte un code. C'est ce qui sépare une écriture à renvoyer plus tard d'une écriture à abandonner.
 */
export function isTransportError(error: unknown): boolean {
  return (
    !hasCode(error) &&
    hasMessage(error) &&
    NETWORK_MESSAGE_PATTERNS.some((pattern) => error.message.includes(pattern))
  );
}

export function dataErrorMessage(error: unknown): string {
  if (hasCode(error)) {
    // P0001 est le code générique de tout `raise exception` sans code explicite : plusieurs messages distincts le partagent (les gardes, join_group_with_code()), donc pas de table de correspondance possible ici — le message porté par l'exception est déjà le texte français à afficher tel quel.
    if (error.code === 'P0001' && hasMessage(error)) {
      return error.message;
    }
    return MESSAGES[error.code] ?? GENERIC;
  }

  if (isTransportError(error)) {
    return 'Pas de connexion. Réessayez.';
  }

  return GENERIC;
}
