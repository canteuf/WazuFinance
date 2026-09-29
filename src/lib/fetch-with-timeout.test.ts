import { isTransportError } from '@/lib/data-errors';
import { createFetchWithTimeout, REQUEST_TIMEOUT_MS } from '@/lib/fetch-with-timeout';

const REST_URL = 'https://projet.supabase.co/rest/v1/transactions';
const AUTH_URL = 'https://projet.supabase.co/auth/v1/token';

function respondWith(status: number): typeof fetch {
  return jest.fn(async () => new Response('<html>Bad gateway</html>', { status }));
}

/** Un fetch qui ne répond jamais, sauf à être annulé : ce que fait React Native sur une 2G muette. */
function hangingFetch(): jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]> {
  return jest.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        });
      })
  );
}

/** Ce que postgrest-js fait d'une exception levée par fetch : un objet littéral sans code, préfixé du nom de l'erreur. */
function asPostgrestError(error: Error) {
  return { message: `${error.name}: ${error.message}`, details: '', hint: '', code: '' };
}

describe('createFetchWithTimeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('laisse passer une réponse normale', async () => {
    const fetchWithTimeout = createFetchWithTimeout(respondWith(200));
    const response = await fetchWithTimeout(REST_URL);
    expect(response.status).toBe(200);
  });

  it('laisse passer une erreur de la base, même en 500', async () => {
    // PostgREST renvoie aussi 500 pour une erreur SQL qui se reproduira : la renvoyer bloquerait la file.
    const fetchWithTimeout = createFetchWithTimeout(respondWith(500));
    await expect(fetchWithTimeout(REST_URL)).resolves.toHaveProperty('status', 500);
  });

  it.each([502, 503, 504, 520, 522, 408, 429])(
    'fait d’un %i de PostgREST une panne de transport',
    async (status) => {
      const fetchWithTimeout = createFetchWithTimeout(respondWith(status));
      const error = await fetchWithTimeout(REST_URL).catch((caught: Error) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(isTransportError(asPostgrestError(error as Error))).toBe(true);
    }
  );

  it('laisse un 429 de l’authentification intact', async () => {
    const fetchWithTimeout = createFetchWithTimeout(respondWith(429));
    await expect(fetchWithTimeout(AUTH_URL)).resolves.toHaveProperty('status', 429);
  });

  it('abandonne une requête sans réponse et la signale comme panne de transport', async () => {
    jest.useFakeTimers();
    const base = hangingFetch();
    const fetchWithTimeout = createFetchWithTimeout(base);

    const pending = fetchWithTimeout(REST_URL).catch((caught: Error) => caught);
    jest.advanceTimersByTime(REQUEST_TIMEOUT_MS);
    const error = (await pending) as Error;

    expect(error.name).toBe('TimeoutError');
    expect(isTransportError(asPostgrestError(error))).toBe(true);
    // La requête sous-jacente est annulée, pas laissée ouverte.
    expect(base.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('n’abandonne pas avant le délai', async () => {
    jest.useFakeTimers();
    const fetchWithTimeout = createFetchWithTimeout(hangingFetch());
    let settled = false;
    void fetchWithTimeout(REST_URL).then(
      () => (settled = true),
      () => (settled = true)
    );
    jest.advanceTimersByTime(REQUEST_TIMEOUT_MS - 1);
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it('relaie une annulation voulue par l’appelant', async () => {
    const controller = new AbortController();
    const fetchWithTimeout = createFetchWithTimeout(hangingFetch());
    const pending = fetchWithTimeout(REST_URL, { signal: controller.signal }).catch(
      (caught: Error) => caught
    );
    controller.abort();
    const error = (await pending) as Error;
    // Une AbortError : postgrest-js la traite comme une annulation, que l'app ne renvoie pas.
    expect(error.name).toBe('AbortError');
  });
});
