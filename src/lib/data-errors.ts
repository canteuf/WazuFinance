/**
 * Messages français pour les erreurs de données.
 *
 * On mappe les codes SQLSTATE, jamais les messages : ceux-ci changent entre
 * versions de Postgres et de PostgREST. Même règle que src/lib/auth-errors.ts.
 */

const MESSAGES: Record<string, string> = {
  '42501': "Vous n'avez pas accès à ce budget.",
  '23503': "Cette catégorie n'existe plus.",
  '23514': 'Montant invalide.',
  '23505': 'Cette opération existe déjà.',
  PGRST116: 'Cette opération est introuvable.',
};

const GENERIC = 'Une erreur inattendue est survenue.';

function hasCode(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

export function dataErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes('Network request failed')) {
    return 'Pas de connexion. Réessayez.';
  }

  if (hasCode(error)) {
    return MESSAGES[error.code] ?? GENERIC;
  }

  return GENERIC;
}
