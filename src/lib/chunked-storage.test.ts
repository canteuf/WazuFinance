import {
  CHUNK_SIZE,
  readChunked,
  removeChunked,
  writeChunked,
  type KeyValueStore,
} from '@/lib/chunked-storage';

/** Stockage en mémoire qui peut « mourir » après un nombre donné d'écritures, comme une app tuée par Android pendant qu'elle écrit. */
function memoryStore(): KeyValueStore & { data: Map<string, string>; failAfter: number | null } {
  const data = new Map<string, string>();
  const store = {
    data,
    failAfter: null as number | null,
    async get(key: string) {
      return data.get(key) ?? null;
    },
    async set(key: string, value: string) {
      if (store.failAfter !== null) {
        if (store.failAfter === 0) {
          throw new Error('app tuée');
        }
        store.failAfter--;
      }
      data.set(key, value);
    },
    async remove(key: string) {
      if (store.failAfter === 0) {
        throw new Error('app tuée');
      }
      data.delete(key);
    },
  };
  return store;
}

const KEY = 'sb-ref-auth-token';
const long = (letter: string, chunks: number) => letter.repeat(CHUNK_SIZE * chunks - 7);

describe('chunked-storage', () => {
  it('relit ce qu’il a écrit, sur plusieurs morceaux', async () => {
    const store = memoryStore();
    await writeChunked(store, KEY, long('a', 4));
    expect(await readChunked(store, KEY)).toBe(long('a', 4));
  });

  it('rend null quand rien n’est écrit', async () => {
    expect(await readChunked(memoryStore(), KEY)).toBeNull();
  });

  it('alterne les jeux et efface l’ancien après la bascule', async () => {
    const store = memoryStore();
    await writeChunked(store, KEY, long('a', 4));
    await writeChunked(store, KEY, long('b', 2));
    expect(await readChunked(store, KEY)).toBe(long('b', 2));
    expect([...store.data.keys()].sort()).toEqual([`${KEY}.b.0`, `${KEY}.b.1`, `${KEY}.slot`]);
  });

  it('garde l’ancienne valeur entière si l’écriture meurt avant la bascule', async () => {
    const store = memoryStore();
    await writeChunked(store, KEY, long('a', 4));
    // Cinq morceaux à écrire, puis le pointeur : mourir après 0 à 5 écritures laisse le pointeur en place.
    for (let written = 0; written <= 5; written++) {
      store.failAfter = written;
      await expect(writeChunked(store, KEY, long('b', 5))).rejects.toThrow('app tuée');
      store.failAfter = null;
      expect(await readChunked(store, KEY)).toBe(long('a', 4));
    }
  });

  it('rend la nouvelle valeur entière si l’écriture meurt pendant le ménage', async () => {
    const store = memoryStore();
    await writeChunked(store, KEY, long('a', 4));
    // Cinq morceaux puis le pointeur : la bascule a eu lieu, le ménage non.
    store.failAfter = 6;
    await expect(writeChunked(store, KEY, long('b', 5))).rejects.toThrow('app tuée');
    store.failAfter = null;
    expect(await readChunked(store, KEY)).toBe(long('b', 5));
  });

  it('ne mélange jamais deux valeurs, où que l’écriture s’arrête', async () => {
    const store = memoryStore();
    await writeChunked(store, KEY, long('a', 3));
    for (let written = 0; written < 12; written++) {
      const before = await readChunked(store, KEY);
      store.failAfter = written;
      const next = long(written % 2 === 0 ? 'b' : 'c', 1 + (written % 4));
      await writeChunked(store, KEY, next).catch(() => undefined);
      store.failAfter = null;
      expect([before, next]).toContain(await readChunked(store, KEY));
    }
  });

  it('relit le format de la version précédente, puis le remplace à la première écriture', async () => {
    const store = memoryStore();
    store.data.set(`${KEY}.count`, '2');
    store.data.set(`${KEY}.0`, 'ancienne-');
    store.data.set(`${KEY}.1`, 'session');
    expect(await readChunked(store, KEY)).toBe('ancienne-session');

    await writeChunked(store, KEY, 'nouvelle');
    expect(await readChunked(store, KEY)).toBe('nouvelle');
    expect(store.data.has(`${KEY}.count`)).toBe(false);
    expect(store.data.has(`${KEY}.1`)).toBe(false);
  });

  it('efface tout, format précédent compris', async () => {
    const store = memoryStore();
    store.data.set(`${KEY}.count`, '1');
    store.data.set(`${KEY}.0`, 'vieux');
    await writeChunked(store, KEY, long('a', 2));
    store.data.set(`${KEY}.count`, '1');
    store.data.set(`${KEY}.0`, 'vieux');
    await removeChunked(store, KEY);
    expect(store.data.size).toBe(0);
    expect(await readChunked(store, KEY)).toBeNull();
  });
});
