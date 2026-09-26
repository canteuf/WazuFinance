import {
  keepQueueAcrossVersions,
  patchIsApplied,
  PERSISTED_HISTORY_PAGES,
  prepareForDisk,
  queueOnly,
  transportRetryDelay,
  VersionChain,
  type PersistedCache,
} from '@/lib/offline-queue';

function cache(overrides: Partial<PersistedCache['clientState']> = {}, buster = '1.0.0#2'): PersistedCache {
  return {
    buster,
    timestamp: 0,
    clientState: { mutations: [], queries: [], ...overrides },
  };
}

const paused = { mutationKey: ['transactionWrites', 'create'], state: { status: 'pending', isPaused: true } };
const inFlight = { mutationKey: ['transactionWrites', 'create'], state: { status: 'pending', isPaused: false } };
const done = { mutationKey: ['transactionWrites', 'update'], state: { status: 'success', isPaused: false } };
const summary = { queryKey: ['transactions', 'summary'], state: { data: { balance: 10 } } };

describe('transportRetryDelay', () => {
  it('double à chaque essai, sans dépasser une minute', () => {
    expect([0, 1, 2, 3].map(transportRetryDelay)).toEqual([2_000, 4_000, 8_000, 16_000]);
    expect(transportRetryDelay(10)).toBe(60_000);
  });
});

describe('VersionChain', () => {
  it('rend la version lue quand la session ne l’a pas remplacée', () => {
    expect(new VersionChain().resolve('t1', 'v1')).toBe('v1');
  });

  it('suit les versions produites par les modifications de la session', () => {
    const chain = new VersionChain();
    chain.record('t1', 'v1', 'v2');
    chain.record('t1', 'v2', 'v3');
    expect(chain.resolve('t1', 'v1')).toBe('v3');
  });

  it('ne mélange pas deux opérations', () => {
    const chain = new VersionChain();
    chain.record('t1', 'v1', 'v2');
    expect(chain.resolve('t2', 'v1')).toBe('v1');
  });

  it('laisse passer une modification sans version (ancienne file)', () => {
    expect(new VersionChain().resolve('t1', undefined)).toBeUndefined();
  });

  it('ne tourne pas en rond sur une boucle', () => {
    const chain = new VersionChain();
    chain.record('t1', 'v1', 'v2');
    chain.record('t1', 'v2', 'v1');
    expect(['v1', 'v2']).toContain(chain.resolve('t1', 'v1'));
  });
});

describe('patchIsApplied', () => {
  const row = {
    category_id: 'c1',
    type: 'expense',
    amount: 5000,
    occurred_on: '2026-09-26',
    note: 'Marché',
    wallet_id: 'w1',
  };

  it('reconnaît une modification déjà écrite', () => {
    expect(patchIsApplied(row, { ...row })).toBe(true);
  });

  it('compare le montant en nombre, même rendu en chaîne', () => {
    expect(patchIsApplied({ ...row, amount: '5000' as unknown as number }, row)).toBe(true);
  });

  it('voit une différence réelle', () => {
    expect(patchIsApplied(row, { ...row, amount: 6000 })).toBe(false);
    expect(patchIsApplied(row, { ...row, note: null })).toBe(false);
    expect(patchIsApplied(row, { ...row, wallet_id: 'w2' })).toBe(false);
  });

  it('ignore le portefeuille quand la modification n’en demande aucun en particulier', () => {
    const { wallet_id: _wallet, ...withoutWallet } = row;
    expect(patchIsApplied(row, withoutWallet)).toBe(true);
    expect(patchIsApplied(row, { ...row, wallet_id: null })).toBe(true);
  });
});

describe('prepareForDisk', () => {
  it('écrit une saisie en cours d’envoi comme une pause, pour qu’elle reparte au démarrage', () => {
    const written = prepareForDisk(cache({ mutations: [paused, inFlight, done] }));
    expect(written.clientState.mutations.map((m) => m.state.isPaused)).toEqual([true, true, false]);
  });

  it('ne garde que les premières pages d’un historique', () => {
    const pages = Array.from({ length: 20 }, (_, index) => [`ligne ${index}`]);
    const history = {
      queryKey: ['transactions', 'history'],
      state: { data: { pages, pageParams: pages.map((_, index) => index) } },
    };
    const written = prepareForDisk(cache({ queries: [history, summary] }));
    const data = written.clientState.queries[0].state.data as { pages: unknown[]; pageParams: unknown[] };
    expect(data.pages).toHaveLength(PERSISTED_HISTORY_PAGES);
    expect(data.pageParams).toEqual([0, 1]);
    expect(written.clientState.queries[1]).toBe(summary);
  });

  it('ne touche pas au cache en mémoire', () => {
    const original = cache({ mutations: [inFlight] });
    prepareForDisk(original);
    expect(original.clientState.mutations[0].state.isPaused).toBe(false);
  });
});

describe('keepQueueAcrossVersions', () => {
  it('rend tel quel un cache de la même version', () => {
    const same = cache({ mutations: [paused], queries: [summary] });
    expect(keepQueueAcrossVersions(same, '1.0.0#2')).toBe(same);
  });

  it('garde la file mais jette les données lues d’une autre version', () => {
    const restored = keepQueueAcrossVersions(cache({ mutations: [paused], queries: [summary] }), '1.1.0#2');
    expect(restored.buster).toBe('1.1.0#2');
    expect(restored.clientState.mutations).toEqual([paused]);
    expect(restored.clientState.queries).toEqual([]);
  });
});

describe('queueOnly', () => {
  it('ne garde que les saisies pas encore envoyées', () => {
    const kept = queueOnly(cache({ mutations: [paused, done], queries: [summary] }));
    expect(kept?.clientState.mutations).toEqual([paused]);
    expect(kept?.clientState.queries).toEqual([]);
  });

  it('rend null quand il n’y a rien à garder', () => {
    expect(queueOnly(cache({ mutations: [done], queries: [summary] }))).toBeNull();
  });
});
