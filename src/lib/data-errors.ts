/**
 * Messages français pour les erreurs de données.
 *
 * On mappe d'abord les codes SQLSTATE, qui ne changent pas entre versions de Postgres et de PostgREST — même règle que src/lib/auth-errors.ts. Une panne de transport (connexion perdue) ne porte jamais de SQLSTATE : le client PostgREST installé l'attrape et renvoie un objet littéral avec `code: ""` et un `message` du type `"TypeError: Network request failed"` (React Native) ou `"TypeError: Failed to fetch"` (navigateur). Pour ce seul cas on retombe sur le message, faute d'alternative : le code reste prioritaire dès qu'il est renseigné.
 */

const MESSAGES: Record<string, string> = {
  '42501': "Vous n'avez pas accès à ce budget.",
  '23503': "Cette catégorie n'existe plus.",
  '23514': 'Montant invalide.',
  // Formulation neutre : ce code sert désormais aux budgets, dont le triplet (group_id, category_id, period) est unique. Les transactions, elles, n'ont aucune contrainte d'unicité — ce message n'a jamais pu s'y afficher.
  '23505': 'Un enregistrement identique existe déjà.',
  PGRST116: 'Cette opération est introuvable.',
};

const GENERIC = 'Une erreur inattendue est survenue.';

const NETWORK_MESSAGE_PATTERNS = ['Network request failed', 'Failed to fetch'];

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

export function dataErrorMessage(error: unknown): string {
  if (hasCode(error)) {
    // P0001 est le code générique de tout `raise exception` sans code explicite : plusieurs messages distincts le partagent (les gardes, join_group_with_code()), donc pas de table de correspondance possible ici — le message porté par l'exception est déjà le texte français à afficher tel quel.
    if (error.code === 'P0001' && hasMessage(error)) {
      return error.message;
    }
    return MESSAGES[error.code] ?? GENERIC;
  }

  if (
    hasMessage(error) &&
    NETWORK_MESSAGE_PATTERNS.some((pattern) => error.message.includes(pattern))
  ) {
    return 'Pas de connexion. Réessayez.';
  }

  return GENERIC;
}
