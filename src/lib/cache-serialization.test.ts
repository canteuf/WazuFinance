import { deserializeCache, serializeCache } from './cache-serialization';

function roundTrip<T>(value: T): T {
  return deserializeCache<T>(serializeCache(value));
}

describe('serializeCache / deserializeCache', () => {
  it('reconstruit une Map, que JSON.stringify seul réduit à un objet vide', () => {
    const totals = new Map([['2026-09-24', { total: -1500, count: 2 }]]);

    expect(JSON.parse(JSON.stringify(totals))).toEqual({});

    const restored = roundTrip(totals);
    expect(restored).toBeInstanceOf(Map);
    expect(restored.get('2026-09-24')).toEqual({ total: -1500, count: 2 });
  });

  it('reconstruit une Map rangée dans un objet, comme les données du cache', () => {
    const state = { data: { goals: [{ id: 'g1' }], rhythms: new Map([['g1', 5000]]) } };

    const restored = roundTrip(state);
    expect(restored.data.rhythms.get('g1')).toBe(5000);
    expect(restored.data.goals).toEqual([{ id: 'g1' }]);
  });

  it('reconstruit les Map imbriquées et les Set', () => {
    const nested = new Map([['a', new Map([['b', new Set([1, 2])]])]]);

    const restored = roundTrip(nested);
    expect(restored.get('a')?.get('b')).toEqual(new Set([1, 2]));
  });

  it('laisse intactes les valeurs JSON ordinaires', () => {
    const plain = { amount: 1200, note: null, tags: ['x'], nested: { ok: true } };

    expect(roundTrip(plain)).toEqual(plain);
  });
});
