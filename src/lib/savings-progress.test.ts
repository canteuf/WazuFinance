import { savingsProgress } from '@/lib/savings-progress';
import type { SavingsGoal } from '@/data/savings-goals';

function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    name: 'Vacances',
    target_amount: 1000,
    current_amount: 250,
    target_date: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('savingsProgress', () => {
  it('calcule le pourcentage arrondi', () => {
    const result = savingsProgress(goal({ target_amount: 1000, current_amount: 250 }));
    expect(result.percent).toBe(25);
    expect(result.status).toBe('in_progress');
  });

  it('passe en atteint pile a 100 %', () => {
    const result = savingsProgress(goal({ target_amount: 500, current_amount: 500 }));
    expect(result.percent).toBe(100);
    expect(result.status).toBe('reached');
  });

  it('depasse 100 % dans le texte, sans etre plafonne par le calcul', () => {
    const result = savingsProgress(goal({ target_amount: 200, current_amount: 290 }));
    expect(result.percent).toBe(145);
    expect(result.status).toBe('reached');
  });

  it(`rend 0 % quand rien n'est encore epargne`, () => {
    const result = savingsProgress(goal({ target_amount: 300, current_amount: 0 }));
    expect(result.percent).toBe(0);
    expect(result.status).toBe('in_progress');
  });

  it('arrondit au plus proche', () => {
    const result = savingsProgress(goal({ target_amount: 300, current_amount: 100 }));
    expect(result.percent).toBe(33);
  });
});
