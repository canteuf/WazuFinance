import {
  formatActivity,
  formatActivityTime,
  wasEdited,
  type ActivityLogRow,
  type CategoryName,
} from '@/lib/activity-format';

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

describe('formatActivity — opérations', () => {
  it('décrit un changement de montant', () => {
    expect(formatActivity(entry(), null, categories)).toBe(
      'Marie a modifié Restaurants : 15,00 € → 150,00 €'
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

    expect(result).toBe('Marie a supprimé Alimentation · Carrefour, 54,00 € du 8 sept.');
  });

  it(`dit « Vous » quand l'auteur est l'utilisateur courant`, () => {
    expect(formatActivity(entry(), 'user-marie', categories)).toBe(
      'Vous avez modifié Restaurants : 15,00 € → 150,00 €'
    );
  });

  it(`garde le nom d'un auteur dont le compte a disparu`, () => {
    expect(formatActivity(entry({ actor_id: null }), 'user-marie', categories)).toBe(
      'Marie a modifié Restaurants : 15,00 € → 150,00 €'
    );
  });

  it(`signale une action faite hors de l'app`, () => {
    expect(formatActivity(entry({ actor_id: null, actor_name: null }), null, categories)).toBe(
      "Hors de l'app a modifié Restaurants : 15,00 € → 150,00 €"
    );
  });

  it(`remplace une catégorie supprimée depuis`, () => {
    const before = { ...operation, category_id: 'cat-disparue' };
    const result = formatActivity(
      entry({ old_values: before, new_values: { ...before, amount: 150 } }),
      null,
      categories
    );

    expect(result).toBe('Marie a modifié catégorie supprimée : 15,00 € → 150,00 €');
  });

  it(`nomme « Sans catégorie » une opération sans catégorie`, () => {
    const before = { ...operation, category_id: null };
    const result = formatActivity(
      entry({ old_values: before, new_values: { ...before, amount: 150 } }),
      null,
      categories
    );

    expect(result).toBe('Marie a modifié Sans catégorie : 15,00 € → 150,00 €');
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

    expect(result).toBe('Marie a modifié le plafond Restaurants : 200,00 € → 300,00 €');
  });

  it(`décrit une suppression de budget`, () => {
    const result = formatActivity(
      entry({ subject: 'budget', action: 'delete', old_values: budget, new_values: null, changed_fields: [] }),
      null,
      categories
    );

    expect(result).toBe('Marie a supprimé le budget Restaurants (200,00 €)');
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
  // Construits en heure locale puis passés par toISOString() : le test ne
  // dépend pas du fuseau de la machine.
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
