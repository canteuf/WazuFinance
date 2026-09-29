import { todayIso } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { describeRejected, MAX_REJECTED, parseRejected, withRejected, type RejectedWrite } from '@/lib/rejected-writes';

const AT = '2026-09-29T10:00:00.000Z';

describe('describeRejected', () => {
  it('garde de quoi refaire une création refusée', () => {
    const entry = describeRejected(
      ['transactionWrites', 'create'],
      {
        id: 't1',
        groupId: 'g1',
        userId: 'u1',
        type: 'expense',
        amount: 5000,
        categoryId: 'c1',
        occurredOn: '2026-09-12',
        note: 'Marché',
        walletId: 'w1',
        tags: ['Rentrée'],
      },
      'Cette catégorie n’existe plus.',
      'r1',
      AT
    );
    expect(entry).toMatchObject({
      id: 'r1',
      kind: 'create',
      reason: 'Cette catégorie n’existe plus.',
      draft: {
        groupId: 'g1',
        type: 'expense',
        amount: 5000,
        categoryId: 'c1',
        occurredOn: '2026-09-12',
        note: 'Marché',
        walletId: 'w1',
        tags: ['Rentrée'],
      },
    });
    expect(entry?.summary).toContain(`Dépense de ${formatMoney(5000)} du `);
  });

  it('dit « d’aujourd’hui » plutôt que « du Aujourd’hui »', () => {
    const entry = describeRejected(
      ['transactionWrites', 'create'],
      { groupId: 'g1', type: 'income', amount: 800, categoryId: 'c1', occurredOn: todayIso() },
      'Refusé',
      'r1',
      AT
    );
    expect(entry?.summary).toBe(`Revenu de ${formatMoney(800)} d'aujourd'hui`);
  });

  it('lit une saisie mise en file par une version plus ancienne, sans portefeuille ni étiquettes', () => {
    const entry = describeRejected(
      ['transactionWrites', 'create'],
      { groupId: 'g1', type: 'expense', amount: 300, categoryId: 'c1', occurredOn: '2026-09-01' },
      'Refusé',
      'r1',
      AT
    );
    expect(entry?.draft).toMatchObject({ walletId: null, tags: [], note: null });
  });

  it('garde l’opération à rouvrir pour une modification refusée', () => {
    const entry = describeRejected(
      ['transactionWrites', 'update'],
      { id: 't9', patch: { type: 'expense', amount: 1200, occurredOn: '2026-09-10' } },
      'Modifiée par un autre membre',
      'r2',
      AT
    );
    expect(entry).toMatchObject({ kind: 'update', transactionId: 't9' });
    expect(entry?.draft).toBeUndefined();
  });

  it('décrit une suppression et un remboursement refusés', () => {
    expect(describeRejected(['transactionWrites', 'delete'], 't1', 'x', 'r3', AT)?.summary).toBe(
      'Suppression d’une opération'
    );
    expect(
      describeRejected(['transactionWrites', 'debtPayment'], { amount: 2000 }, 'x', 'r4', AT)?.summary
    ).toBe(`Remboursement de ${formatMoney(2000)}`);
  });

  it('ignore une écriture qui n’est pas une saisie en file', () => {
    expect(describeRejected(['budgets', 'adjust'], {}, 'x', 'r5', AT)).toBeNull();
    expect(describeRejected(undefined, {}, 'x', 'r5', AT)).toBeNull();
  });
});

describe('withRejected', () => {
  const item = (id: string): RejectedWrite => ({ id, kind: 'delete', summary: id, reason: '', rejectedAt: AT });

  it('met la plus récente en tête', () => {
    expect(withRejected([item('a')], item('b')).map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('borne la liste', () => {
    const full = Array.from({ length: MAX_REJECTED }, (_, index) => item(`old${index}`));
    const next = withRejected(full, item('new'));
    expect(next).toHaveLength(MAX_REJECTED);
    expect(next[0].id).toBe('new');
  });
});

describe('parseRejected', () => {
  it('écarte un contenu illisible ou mal formé', () => {
    expect(parseRejected(null)).toEqual([]);
    expect(parseRejected('pas du json')).toEqual([]);
    expect(parseRejected('[{"id":1},{"id":"a","summary":"ok"}]')).toEqual([{ id: 'a', summary: 'ok' }]);
  });
});
