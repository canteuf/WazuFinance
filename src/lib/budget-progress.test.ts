import { budgetProgress, WARNING_RATIO } from '@/lib/budget-progress';
import type { BudgetWithCategory } from '@/data/budgets';
import type { CategorySlice } from '@/data/summary';

function budget(categoryId: string, amount: number, name = 'Catégorie'): BudgetWithCategory {
  return {
    id: `budget-${categoryId}`,
    group_id: 'group-1',
    category_id: categoryId,
    period: 'monthly',
    amount,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    category: { id: categoryId, name, icon: 'cart' },
  };
}

function slice(categoryId: string, total: number): CategorySlice {
  return { categoryId, name: 'Catégorie', icon: 'cart', total };
}

describe('budgetProgress', () => {
  it('rapproche un budget de sa dépense par catégorie', () => {
    const [row] = budgetProgress([budget('cat-1', 200)], [slice('cat-1', 50)]);

    expect(row.spent).toBe(50);
    expect(row.remaining).toBe(150);
    expect(row.ratio).toBeCloseTo(0.25);
    expect(row.status).toBe('ok');
  });

  it('donne zéro dépensé à une catégorie absente de la répartition', () => {
    // category_breakdown fait une jointure interne : une catégorie sans dépense n'y figure pas du tout, elle n'y figure pas à zéro.
    const [row] = budgetProgress([budget('cat-1', 200)], []);

    expect(row.spent).toBe(0);
    expect(row.ratio).toBe(0);
    expect(row.status).toBe('ok');
  });

  it('ignore une dépense sans budget correspondant', () => {
    const rows = budgetProgress([budget('cat-1', 200)], [slice('cat-2', 900)]);

    expect(rows).toHaveLength(1);
    expect(rows[0].spent).toBe(0);
  });

  it('passe en alerte exactement au seuil, pas seulement au-delà', () => {
    const [row] = budgetProgress(
      [budget('cat-1', 200)],
      [slice('cat-1', 200 * WARNING_RATIO)]
    );

    expect(row.status).toBe('warning');
  });

  it('reste ok juste sous le seuil', () => {
    const [row] = budgetProgress([budget('cat-1', 200)], [slice('cat-1', 159.99)]);

    expect(row.status).toBe('ok');
  });

  it('passe en dépassement exactement à 100 %', () => {
    const [row] = budgetProgress([budget('cat-1', 200)], [slice('cat-1', 200)]);

    expect(row.status).toBe('over');
    expect(row.remaining).toBe(0);
  });

  it('rend un reste négatif et un ratio supérieur à 1 au-delà du plafond', () => {
    const [row] = budgetProgress([budget('cat-1', 200)], [slice('cat-1', 290)]);

    expect(row.remaining).toBe(-90);
    expect(row.ratio).toBeCloseTo(1.45);
    expect(row.status).toBe('over');
  });

  it('remonte les dépassements, puis les alertes, puis le reste par ratio décroissant', () => {
    const rows = budgetProgress(
      [
        budget('calme', 200, 'Calme'),
        budget('depasse', 100, 'Dépassé'),
        budget('proche', 100, 'Proche'),
        budget('tiede', 200, 'Tiède'),
      ],
      [
        slice('calme', 10),
        slice('depasse', 150),
        slice('proche', 85),
        slice('tiede', 100),
      ]
    );

    // Les fixtures de ce test construisent toujours une catégorie ; la nullabilité du type reflète RLS, pas ce scénario.
    expect(rows.map((row) => row.budget.category?.name)).toEqual([
      'Dépassé',
      'Proche',
      'Tiède',
      'Calme',
    ]);
  });
});
