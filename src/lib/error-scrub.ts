/**
 * Nettoyage d'un rapport de plantage avant son envoi à Sentry.
 *
 * La politique de confidentialité promet que les rapports ne contiennent ni montants ni notes. Deux chemins les laissaient passer :
 *
 * - un objet d'erreur Supabase n'est pas une `Error` JavaScript : Sentry le joint tout entier au rapport (`extra.__serialized__`), avec son champ `details`, où Postgres écrit la ligne refusée par une contrainte (« Failing row contains (…, 1500, Marché, …) ») ;
 * - les messages d'erreur eux-mêmes, qui reprennent ces valeurs, ou la valeur d'une clé en doublon (« Key (id)=(…) already exists »).
 *
 * Module pur, sans le SDK : le même filtre est testé par Jest et appelé par `beforeSend` dans monitoring.ts.
 */

const REDACTED = '…';

/** Chaque motif garde ce qui aide à comprendre l'erreur (le nom de la colonne, la nature du refus) et retire la valeur. */
const PATTERNS: [RegExp, string][] = [
  // Contrainte non respectée : la ligne entière, entre parenthèses, jusqu'à la fin du message.
  [/Failing row contains \([\s\S]*\)\.?/g, `Failing row contains (${REDACTED}).`],
  // Doublon ou clé étrangère : « Key (group_id, name)=(…, Loyer) ».
  [/Key \(([^)]*)\)=\([^)]*\)/g, `Key ($1)=(${REDACTED})`],
  // Valeur refusée par un type : « invalid input syntax for type numeric: "12,5" ».
  [/(invalid input (?:syntax|value) for[^:]*): "[^"]*"/g, `$1: "${REDACTED}"`],
];

export function scrubErrorText(text: string): string {
  return PATTERNS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

/** La partie d'un événement Sentry que le filtre touche ; le reste passe tel quel. */
export type ScrubbableEvent = {
  message?: string;
  extra?: Record<string, unknown>;
  exception?: { values?: { value?: string }[] };
};

/**
 * Retire les données jointes (`extra`, où finit l'objet d'erreur sérialisé) et nettoie le message et le texte de chaque exception. Le type, la pile, l'appareil et l'identifiant du compte restent : c'est ce qui sert à corriger.
 */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  delete event.extra;
  if (event.message) {
    event.message = scrubErrorText(event.message);
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) {
      exception.value = scrubErrorText(exception.value);
    }
  }
  return event;
}
