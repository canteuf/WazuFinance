/**
 * Terme de recherche tel qu'il part vers la base : espaces de bord retirés, `null` s'il ne reste rien.
 *
 * L'astérisque est retiré : PostgREST en fait un joker dans ses `ilike`, alors que `daily_totals()` cherche par position, où il reste un caractère ordinaire. Le garder ferait décrire à la liste et aux totaux des lignes différentes ; aucune note n'a de raison d'en contenir un qu'on voudrait retrouver.
 */
export function normalizeSearch(input: string): string | null {
  const term = input.replace(/\*/g, '').trim();
  return term === '' ? null : term;
}

/**
 * Motif `ilike` qui cherche `term` tel quel, n'importe où dans le texte.
 *
 * `%` et `_` sont des jokers pour `ilike` ; on les échappe, avec la barre oblique inverse qui sert d'échappement, pour qu'une recherche « -50% » trouve « -50% » et non tout ce qui contient « -50 ». Même sens que le `strpos` de `daily_totals()`.
 */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
