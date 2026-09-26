import {
  formatActivity,
  formatActivityTime,
  wasEdited,
  type ActivityLogRow,
  type CategoryName,
} from '@/lib/activity-format';
import { formatMoney } from '@/lib/money';

const categories: CategoryName[] = [
  { id: 'cat-alim', name: 'Alimentation' },
  { id: 'cat-resto', name: 'Restaurants' },
];

const operation = {
  category_id: 'cat-resto',
  amount: 15,
  occurred_on: '2026-09-08',
  type: 'expense',
  note: null,
};

function entry(overrides: Partial<ActivityLogRow> = {}): ActivityLogRow {
  return {
    subject: 'transaction',
    action: 'update',
    actor_id: 'user-marie',
    actor_name: 'Marie',
    old_values: operation,
    new_values: { ...operation, amount: 150 },
    changed_fields: ['amount'],
    ...overrides,
  };
}

// Le code de devise est précédé d'une espace insécable (U+00A0) : écrite en clair, elle ne se distinguerait pas d'une espace ordinaire.
const XAF = ' XAF';

describe('formatActivity — opérations', () => {
  it('décrit un changement de montant', () => {
    expect(formatActivity(entry(), null, categories)).toBe(
      `Marie a modifié Restaurants : 15${XAF} → 150${XAF}`
    );
  });

  it(`nomme par la catégorie d'avant, suivie de la note, et liste plusieurs champs`, () => {
    const before = { ...operation, note: 'Pizzeria' };
    const result = formatActivity(
      entry({
        old_values: before,
        new_values: { ...before, category_id: 'cat-alim', occurred_on: '2026-09-09' },
        changed_fields: ['category_id', 'occurred_on'],
      }),
      null,
      categories
    );

    expect(result).toBe(
      'Marie a modifié Restaurants · Pizzeria : catégorie → Alimentation, date 8 sept. → 9 sept.'
    );
  });

  it('décrit un changement de type et de note', () => {
    const result = formatActivity(
      entry({
        new_values: { ...operation, type: 'income', note: 'Remboursement' },
        changed_fields: ['note', 'type'],
      }),
      null,
      categories
    );

    expect(result).toBe(
      'Marie a modifié Restaurants : type Dépense → Revenu, note aucune → « Remboursement »'
    );
  });

  it('décrit une suppression avec montant et date', () => {
    const result = formatActivity(
      entry({
        action: 'delete',
        old_values: { ...operation, category_id: 'cat-alim', amount: 54, note: 'Carrefour' },
        new_values: null,
        changed_fields: [],
      }),
      null,
      categories
    );

    expect(result).toBe(`Marie a supprimé Alimentation · Carrefour, 54${XAF} du 8 sept.`);
  });

  it(`dit « Vous » quand l'auteur est l'utilisateur courant`, () => {
    expect(formatActivity(entry(), 'user-marie', categories)).toBe(
      `Vous avez modifié Restaurants : 15${XAF} → 150${XAF}`
    );
  });

  it(`garde le nom d'un auteur dont le compte a disparu`, () => {
    expect(formatActivity(entry({ actor_id: null }), 'user-marie', categories)).toBe(
      `Marie a modifié Restaurants : 15${XAF} → 150${XAF}`
    );
  });

  it(`signale une action faite hors de l'app`, () => {
    expect(formatActivity(entry({ actor_id: null, actor_name: null }), null, categories)).toBe(
      `Hors de l'app a modifié Restaurants : 15${XAF} → 150${XAF}`
    );
  });

  it(`remplace une catégorie supprimée depuis`, () => {
    const before = { ...operation, category_id: 'cat-disparue' };
    const result = formatActivity(
      entry({ old_values: before, new_values: { ...before, amount: 150 } }),
      null,
      categories
    );

    expect(result).toBe(`Marie a modifié catégorie supprimée : 15${XAF} → 150${XAF}`);
  });

  it(`nomme « Sans catégorie » une opération sans catégorie`, () => {
    const before = { ...operation, category_id: null };
    const result = formatActivity(
      entry({ old_values: before, new_values: { ...before, amount: 150 } }),
      null,
      categories
    );

    expect(result).toBe(`Marie a modifié Sans catégorie : 15${XAF} → 150${XAF}`);
  });

  it(`garde l'entrée sans détail quand aucun champ n'est affichable`, () => {
    const result = formatActivity(
      entry({ changed_fields: ['savings_goal_id'] }),
      null,
      categories
    );

    expect(result).toBe('Marie a modifié Restaurants');
  });
});

describe('formatActivity — budgets', () => {
  const budget = { category_id: 'cat-resto', amount: 200 };

  it(`décrit un changement de plafond`, () => {
    const result = formatActivity(
      entry({
        subject: 'budget',
        old_values: budget,
        new_values: { ...budget, amount: 300 },
        changed_fields: ['amount'],
      }),
      null,
      categories
    );

    expect(result).toBe(`Marie a modifié le plafond Restaurants : 200${XAF} → 300${XAF}`);
  });

  it(`décrit une suppression de budget`, () => {
    const result = formatActivity(
      entry({ subject: 'budget', action: 'delete', old_values: budget, new_values: null, changed_fields: [] }),
      null,
      categories
    );

    expect(result).toBe(`Marie a supprimé le budget Restaurants (200${XAF})`);
  });

  it(`garde l'entrée sans détail quand aucun champ n'est affichable`, () => {
    const result = formatActivity(
      entry({
        subject: 'budget',
        old_values: budget,
        new_values: { ...budget, period: 'weekly' },
        changed_fields: ['period'],
      }),
      null,
      categories
    );

    expect(result).toBe('Marie a modifié le budget Restaurants');
  });
});

describe('formatActivity — créations et nouveaux sujets', () => {
  const created = (subject: ActivityLogRow['subject'], values: object, overrides: Partial<ActivityLogRow> = {}) =>
    entry({ subject, action: 'insert', old_values: null, new_values: values as never, changed_fields: [], ...overrides });

  it('décrit la saisie d’une opération', () => {
    expect(formatActivity(created('transaction', { ...operation, note: 'Pizzeria' }), null, categories)).toBe(
      `Marie a ajouté Restaurants · Pizzeria, 15${XAF} du 8 sept.`
    );
  });

  it('nomme un remboursement par sa note, pas « Sans catégorie »', () => {
    const repayment = { ...operation, category_id: null, debt_id: 'd1', note: 'Remboursement de Cousin', amount: 4000 };
    expect(formatActivity(created('transaction', repayment), null, categories)).toBe(
      `Marie a ajouté Remboursement de Cousin, ${formatMoney(4000)} du 8 sept.`
    );
  });

  it('décrit la création d’un budget', () => {
    expect(formatActivity(created('budget', { category_id: 'cat-resto', amount: 200 }), 'user-marie', categories)).toBe(
      `Vous avez créé le budget Restaurants (200${XAF})`
    );
  });

  it('décrit un prêt, un emprunt, et sa modification', () => {
    const loan = { direction: 'lent', counterparty: 'Cousin', amount: 10000 };
    expect(formatActivity(created('debt', loan), null, categories)).toBe(
      `Marie a noté le prêt à Cousin (${formatMoney(10000)})`
    );
    expect(formatActivity(created('debt', { ...loan, direction: 'borrowed' }), null, categories)).toBe(
      `Marie a noté l’emprunt à Cousin (${formatMoney(10000)})`
    );
    expect(
      formatActivity(created('debt', { ...loan, direction: 'credit_sale', counterparty: 'Mama Ngo' }), null, categories)
    ).toBe(`Marie a noté la vente à crédit à Mama Ngo (${formatMoney(10000)})`);
    expect(
      formatActivity(
        entry({ subject: 'debt', old_values: loan, new_values: { ...loan, due_on: '2026-10-01' }, changed_fields: ['due_on'] }),
        null,
        categories
      )
    ).toBe('Marie a modifié le prêt à Cousin : échéance → 1 oct.');
  });

  it('décrit un portefeuille créé puis ajusté', () => {
    expect(formatActivity(created('wallet', { name: 'MoMo' }), null, categories)).toBe(
      'Marie a créé le portefeuille MoMo'
    );
    const wallet = { name: 'MoMo', opening_balance: 0 };
    expect(
      formatActivity(
        entry({ subject: 'wallet', old_values: wallet, new_values: { ...wallet, opening_balance: 5000 }, changed_fields: ['opening_balance'] }),
        null,
        categories
      )
    ).toBe(`Marie a modifié le portefeuille MoMo : solde de départ 0${XAF} → ${formatMoney(5000)}`);
  });

  it('décrit un transfert avec le nom des portefeuilles', () => {
    const wallets = [
      { id: 'w1', name: 'Principal' },
      { id: 'w2', name: 'MoMo' },
    ];
    const transfer = { from_wallet_id: 'w1', to_wallet_id: 'w2', amount: 2000 };
    expect(formatActivity(created('transfer', transfer), null, categories, { wallets })).toBe(
      `Marie a transféré ${formatMoney(2000)} de Principal vers MoMo`
    );
    expect(formatActivity(created('transfer', transfer), null, categories)).toBe(
      `Marie a transféré ${formatMoney(2000)} de un portefeuille vers un portefeuille`
    );
  });
});

describe('formatActivity — membres', () => {
  const names = new Map([
    ['user-marie', 'Marie'],
    ['user-bintou', 'Bintou'],
  ]);
  const membership = (action: ActivityLogRow['action'], values: object, after?: object, actor = 'user-bintou') =>
    entry({
      subject: 'membership',
      action,
      actor_id: actor,
      actor_name: actor === 'user-marie' ? 'Marie' : 'Bintou',
      old_values: action === 'insert' ? null : (values as never),
      new_values: action === 'delete' ? null : ((after ?? values) as never),
      changed_fields: action === 'update' ? ['role'] : [],
    });

  it('dit qui a rejoint, et en quel rôle', () => {
    expect(formatActivity(membership('insert', { user_id: 'user-bintou', role: 'member' }), null, categories, { names })).toBe(
      'Bintou a rejoint le groupe'
    );
    expect(formatActivity(membership('insert', { user_id: 'user-bintou', role: 'viewer' }), 'user-bintou', categories, { names })).toBe(
      'Vous avez rejoint le groupe en lecteur'
    );
  });

  it('distingue un départ d’une exclusion', () => {
    expect(formatActivity(membership('delete', { user_id: 'user-bintou' }), null, categories, { names })).toBe(
      'Bintou a quitté le groupe'
    );
    expect(
      formatActivity(membership('delete', { user_id: 'user-bintou' }, undefined, 'user-marie'), null, categories, { names })
    ).toBe('Marie a exclu Bintou');
  });

  it('attribue un départ sans auteur à la personne partie (compte supprimé)', () => {
    expect(
      formatActivity({ ...membership('delete', { user_id: 'user-bintou' }), actor_id: null, actor_name: null }, null, categories, { names })
    ).toBe('Bintou a quitté le groupe');
  });

  it('décrit un changement de rôle et une passation', () => {
    expect(
      formatActivity(
        membership('update', { user_id: 'user-bintou', role: 'member' }, { user_id: 'user-bintou', role: 'viewer' }, 'user-marie'),
        null,
        categories,
        { names }
      )
    ).toBe('Marie a changé le rôle de Bintou : membre → lecteur');
    expect(
      formatActivity(
        membership('update', { user_id: 'user-bintou', role: 'member' }, { user_id: 'user-bintou', role: 'owner' }, 'user-marie'),
        'user-marie',
        categories,
        { names }
      )
    ).toBe('Vous avez confié le groupe à Bintou');
    expect(
      formatActivity(
        membership('update', { user_id: 'user-marie', role: 'owner' }, { user_id: 'user-marie', role: 'member' }, 'user-marie'),
        null,
        categories,
        { names }
      )
    ).toBe('Marie a changé son rôle : propriétaire → membre');
  });

  it('nomme « un membre » une personne inconnue', () => {
    expect(formatActivity(membership('delete', { user_id: 'user-x' }, undefined, 'user-marie'), null, categories)).toBe(
      'Marie a exclu un membre'
    );
  });
});

describe('formatActivity — valeurs malformées', () => {
  it(`ne plante pas sur des old_values qui ne sont pas un objet`, () => {
    const result = formatActivity(
      entry({ old_values: 'oops', new_values: [1, 2] }),
      null,
      categories
    );

    expect(result).toBe('Marie a modifié Sans catégorie');
  });

  it(`omet un montant qui n'est pas un nombre`, () => {
    const result = formatActivity(
      entry({ old_values: { ...operation, amount: '15' } }),
      null,
      categories
    );

    expect(result).toBe('Marie a modifié Restaurants');
  });
});

describe('formatActivityTime', () => {
  // Construits en heure locale puis passés par toISOString() : le test ne dépend pas du fuseau de la machine.
  const now = new Date(2026, 8, 10, 18, 0);

  it(`dit « Aujourd'hui » pour le jour même`, () => {
    expect(formatActivityTime(new Date(2026, 8, 10, 14, 32).toISOString(), now)).toBe(
      "Aujourd'hui, 14:32"
    );
  });

  it(`dit « Hier » pour la veille`, () => {
    expect(formatActivityTime(new Date(2026, 8, 9, 9, 5).toISOString(), now)).toBe('Hier, 09:05');
  });

  it(`donne jour et mois dans l'année en cours`, () => {
    expect(formatActivityTime(new Date(2026, 8, 8, 9, 5).toISOString(), now)).toBe(
      '8 sept., 09:05'
    );
  });

  it(`ajoute l'année pour une année passée`, () => {
    expect(formatActivityTime(new Date(2025, 8, 8, 9, 5).toISOString(), now)).toBe(
      '8 sept. 2025, 09:05'
    );
  });

  it(`accepte les six décimales que rend Postgres`, () => {
    const iso = new Date(2026, 8, 10, 14, 32).toISOString().replace('.000Z', '.123456+00:00');

    expect(formatActivityTime(iso, now)).toBe("Aujourd'hui, 14:32");
  });
});

describe('wasEdited', () => {
  it(`est faux quand updated_at vaut created_at`, () => {
    expect(
      wasEdited({
        created_at: '2026-09-10T14:32:05.123456+00:00',
        updated_at: '2026-09-10T14:32:05.123456+00:00',
      })
    ).toBe(false);
  });

  it(`est vrai quand updated_at est postérieur`, () => {
    expect(
      wasEdited({
        created_at: '2026-09-10T14:32:05+00:00',
        updated_at: '2026-09-10T16:00:00.5+00:00',
      })
    ).toBe(true);
  });
});
