/**
 * Écriture et relecture du cache TanStack Query sur le téléphone.
 *
 * `JSON.stringify` ne sait pas écrire une `Map` ni un `Set` : il les réduit à `{}` sans lever. Plusieurs lectures renvoient une `Map` (totaux par jour de l'historique, rythmes d'épargne, aperçus de groupes) ; relues ainsi, elles arrivaient à l'écran comme un objet vide sans `.get()`, et l'onglet plantait au premier rendu — puis à chaque ouverture, puisque le cache relu restait affiché tant que la requête n'était pas revenue. Les deux types sont donc écrits sous une forme étiquetée, et reconstruits à la relecture.
 */

const TAG = '__cacheType';

type Tagged = { [TAG]: 'Map' | 'Set'; values: unknown[] };

function isTagged(value: unknown): value is Tagged {
  return (
    typeof value === 'object' &&
    value !== null &&
    TAG in value &&
    Array.isArray((value as { values?: unknown }).values)
  );
}

export function serializeCache(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (current instanceof Map) {
      return { [TAG]: 'Map', values: [...current.entries()] } satisfies Tagged;
    }
    if (current instanceof Set) {
      return { [TAG]: 'Set', values: [...current.values()] } satisfies Tagged;
    }
    return current;
  });
}

export function deserializeCache<T>(text: string): T {
  // Le reviver visite les enfants avant leur parent : les entrées d'une Map sont déjà reconstruites quand la Map l'est, ce qui couvre les Map imbriquées.
  return JSON.parse(text, (_key, current: unknown) => {
    if (isTagged(current)) {
      return current[TAG] === 'Map'
        ? new Map(current.values as [unknown, unknown][])
        : new Set(current.values);
    }
    return current;
  }) as T;
}
