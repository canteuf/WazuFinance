/**
 * Régénère src/types/database.ts depuis le projet Supabase lié.
 *
 * Existe parce que la commande brute (`npx supabase gen types typescript --linked > src/types/database.ts`) a cassé le fichier deux fois : sous PowerShell, l'opérateur `>` écrit en UTF-16, tsc ne trouve alors plus aucun export et git voit le fichier comme binaire ; et la redirection, quel que soit l'encodage, écrase l'en-tête et les alias d'enums que le code applicatif importe. Une commande qu'il faut se rappeler de réparer après coup finit par être lancée sans la réparation.
 *
 * Ce script capture la sortie au lieu de la rediriger, la recompose avec l'en-tête et les alias, et écrit en UTF-8. Toujours `--linked`, jamais `--local` : la pile locale tourne une autre version de PostgREST et omet le bloc __InternalSupabase. Si une migration n'est pas encore poussée, la pousser d'abord.
 *
 * Usage : npm run db:types
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'src', 'types', 'database.ts');

const HEADER = `/**
 * Types de la base Supabase — GÉNÉRÉS, ne pas éditer à la main.
 *
 * Régénérer après toute migration :
 *
 *   npm run db:types
 *
 * Le script remet lui-même cet en-tête et les alias d'enums ; ne pas rediriger \`supabase gen types\` vers ce fichier à la main, la redirection les perd (et, sous PowerShell, écrit en UTF-16).
 *
 * Toujours régénérer depuis --linked, jamais depuis --local : la pile locale tourne une autre version de PostgREST et omet le bloc __InternalSupabase. Si la migration n'est pas encore poussée, la pousser d'abord.
 */
`;

/** Les enums du schéma, sous un nom lisible depuis le code applicatif. Un enum ajouté par une migration s'ajoute ici. */
const ALIASES = `
// Alias lisibles pour les enums du schéma, utilisés dans le code applicatif.
export type MembershipRole = Enums<'membership_role'>;
export type TransactionType = Enums<'transaction_type'>;
export type BudgetPeriod = Enums<'budget_period'>;
export type ActivitySubject = Enums<'activity_subject'>;
export type ActivityAction = Enums<'activity_action'>;
`;

// `execSync` et non `execFileSync` : la CLI Supabase n'est pas une dépendance du projet, elle passe par npx, et Node refuse depuis la v20 de lancer un `.cmd` sans shell (EINVAL). La commande est écrite en dur ici, sans aucune entrée extérieure, donc le shell n'ouvre pas d'injection.
const generated = execSync('npx supabase gen types typescript --linked', {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'inherit'],
});

// Un échec d'authentification ou de lien peut renvoyer un code 0 avec une sortie inutilisable : mieux vaut s'arrêter que d'écraser un fichier valide par un message d'erreur.
if (!generated.includes('export type Json') || !generated.includes('__InternalSupabase')) {
  console.error(
    'La sortie de `supabase gen types` est inattendue : ni `export type Json` ni `__InternalSupabase`.\n' +
      'Le fichier n’a pas été touché. Vérifier `npx supabase projects list` et le lien du projet.'
  );
  process.exit(1);
}

writeFileSync(target, `${HEADER}\n${generated.trimEnd()}\n${ALIASES}`, 'utf8');
console.log(`src/types/database.ts régénéré (${generated.length} caractères, UTF-8).`);
