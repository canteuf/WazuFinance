/**
 * `fetch` du client Supabase : une limite de temps, et les pannes passagères de l'infrastructure traitées comme des pannes de transport.
 *
 * Le `fetch` de React Native n'a aucune limite de temps (OkHttp y est réglé sans délai de connexion ni de lecture). Sur une 2G qui vacille, NetInfo dit « connecté » et une requête peut rester sans réponse indéfiniment : le bouton « Enregistrer » tournait sans fin, et les saisies en file, envoyées une par une, attendaient toutes derrière elle.
 */

/** Au-delà, la requête est abandonnée et signalée comme une panne de transport. Assez large pour une page d'historique en 2G. */
export const REQUEST_TIMEOUT_MS = 20_000;

/** Texte des erreurs levées ici. `isTransportError()` (data-errors.ts) le reconnaît, comme le « Network request failed » de React Native. */
export const TIMEOUT_MESSAGE = 'Network request timed out';
export const UNAVAILABLE_MESSAGE = 'Network request failed: service unavailable';

/**
 * Statuts d'une passerelle ou d'un proxy, jamais d'une erreur SQL : maintenance de Supabase, page d'erreur Cloudflare, limitation de débit. Le corps n'est souvent pas du JSON, et le client PostgREST en faisait une erreur sans code que l'app prenait pour un refus définitif — une saisie en file était alors retirée.
 *
 * 500 n'y est pas : PostgREST le renvoie aussi pour des erreurs SQL qui se reproduiront à chaque essai, et une telle saisie bloquerait la file pour toujours.
 */
const TRANSIENT_STATUSES = new Set([408, 429, 502, 503, 504, 520, 521, 522, 523, 524]);

/** Seules les requêtes PostgREST : un 429 de l'authentification porte un code que `auth-errors.ts` traduit, et doit arriver tel quel. */
const REST_PATH = '/rest/v1/';

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

export function createFetchWithTimeout(
  baseFetch: typeof fetch = fetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const outer = init?.signal;
    const abortFromOuter = () => controller.abort();
    if (outer) {
      if (outer.aborted) {
        controller.abort();
      } else {
        outer.addEventListener('abort', abortFromOuter);
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    // Une erreur à nous plutôt que l'AbortError du fetch : le client PostgREST relaie une AbortError comme une annulation voulue, que l'app ne doit pas renvoyer.
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(namedError('TimeoutError', TIMEOUT_MESSAGE));
        controller.abort();
      }, timeoutMs);
    });

    const request = baseFetch(input, { ...init, signal: controller.signal }).then((response) => {
      if (TRANSIENT_STATUSES.has(response.status) && requestUrl(input).includes(REST_PATH)) {
        throw namedError('TransientHttpError', `${UNAVAILABLE_MESSAGE} (HTTP ${response.status})`);
      }
      return response;
    });

    return Promise.race([request, timeout]).finally(() => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', abortFromOuter);
    });
  };
}
