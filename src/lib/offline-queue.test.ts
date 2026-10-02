import {
  isRetryingWrite,
  keepQueueAcrossVersions,
  mergeSavedRow,
  patchIsApplied,
  PERSISTED_HISTORY_PAGES,
  prepareForDisk,
  queueOnly,
  rescueExpiredQueue,
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

describe('isRetryingWrite', () => {
  it('vrai pour une écriture en attente de renvoi après une panne de transport', () => {
    expect(isRetryingWrite({ status: 'pending', failureCount: 1 })).toBe(true);
  });

  it('faux pour un refus de la base, que query-core compte aussi comme un échec', () => {
    expect(isRetryingWrite({ status: 'error', failureCount: 1 })).toBe(false);
  });

  it('faux pour une écriture en cours qui n’a pas encore échoué', () => {
    expect(isRetryingWrite({ status: 'pending', failureCount: 0 })).toBe(false);
  });
});

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
    expect(patchIsApplied({ ...row, tags: ['Jean'] }, { ...row, tags: ['Jean', 'Rentrée'] })).toBe(false);
  });

  it('compare les étiquettes, et les ignore quand la modification n’en porte pas', () => {
    expect(patchIsApplied({ ...row, tags: ['Jean'] }, { ...row, tags: ['Jean'] })).toBe(true);
    expect(patchIsApplied({ ...row, tags: ['Jean'] }, row)).toBe(true);
    expect(patchIsApplied(row, { ...row, tags: [] })).toBe(true);
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

describe('mergeSavedRow', () => {
  const food = { id: 'c1', name: 'Alimentation', icon: 'food' };
  const row = { id: 't1', amount: 1500, category_id: 'c1', category: food, updated_at: 'v1' };
  const other = { id: 't2', amount: 900, category_id: 'c1', category: food, updated_at: 'v1' };

  it('reporte la nouvelle version dans une liste', () => {
    const saved = { id: 't1', amount: 2000, category_id: 'c1', updated_at: 'v2' };
    const next = mergeSavedRow([row, other], saved, null) as (typeof row)[];
    expect(next[0]).toEqual({ ...row, amount: 2000, updated_at: 'v2' });
    // L'autre ligne est la même, à l'identique.
    expect(next[1]).toBe(other);
  });

  it('reporte la nouvelle version dans les pages d’un historique', () => {
    const saved = { id: 't2', amount: 950, category_id: 'c1', updated_at: 'v2' };
    const history = { pages: [[row], [other]], pageParams: [null, 'cursor'] };
    const next = mergeSavedRow(history, saved, null) as typeof history;
    expect(next.pages[0][0]).toBe(row);
    expect(next.pages[1][0]).toMatchObject({ amount: 950, updated_at: 'v2', category: food });
  });

  it('prend la catégorie fournie quand elle a changé', () => {
    const transport = { id: 'c2', name: 'Transport', icon: 'bus' };
    const saved = { id: 't1', amount: 1500, category_id: 'c2', updated_at: 'v2' };
    const next = mergeSavedRow([row], saved, transport) as (typeof row)[];
    expect(next[0].category).toBe(transport);
  });

  it('met à jour la fiche d’une opération', () => {
    const saved = { id: 't1', amount: 3000, category_id: 'c1', updated_at: 'v3' };
    expect(mergeSavedRow(row, saved, null)).toMatchObject({ amount: 3000, updated_at: 'v3' });
  });

  it('rend telle quelle une donnée qui ne contient pas la ligne', () => {
    const totals = { income: 10, expense: 5 };
    const list = [other];
    const saved = { id: 't1', amount: 1, category_id: 'c1', updated_at: 'v2' };
    expect(mergeSavedRow(totals, saved, null)).toBe(totals);
    expect(mergeSavedRow(list, saved, null)).toBe(list);
  });
});

describe('rescueExpiredQueue', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const MAX_AGE = 30 * DAY;

  it('rend tel quel un cache encore frais', () => {
    const fresh = { ...cache({ mutations: [paused], queries: [summary] }), timestamp: 10 * DAY };
    expect(rescueExpiredQueue(fresh, 20 * DAY, MAX_AGE)).toBe(fresh);
  });

  it('garde les saisies d’un cache « périmé » par une horloge qui a sauté, et remet son heure à maintenant', () => {
    // Écrit à une heure fausse, dans le passé ; relu une fois l'heure remise juste.
    const stale = { ...cache({ mutations: [paused, done], queries: [summary] }), timestamp: 0 };
    const rescued = rescueExpiredQueue(stale, 200 * DAY, MAX_AGE);
    expect(rescued.timestamp).toBe(200 * DAY);
    expect(rescued.clientState.mutations).toEqual([paused]);
    expect(rescued.clientState.queries).toEqual([]);
  });

  it('laisse la bibliothèque jeter un cache périmé sans saisie en file', () => {
    const stale = { ...cache({ mutations: [done], queries: [summary] }), timestamp: 0 };
    expect(rescueExpiredQueue(stale, 200 * DAY, MAX_AGE)).toBe(stale);
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
