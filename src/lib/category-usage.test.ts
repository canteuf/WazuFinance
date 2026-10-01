import { deletionSummary, needsReplacement, usageLabel } from '@/lib/category-usage';

const usage = (transactions: number, budgets = 0, recurring = 0) => ({ transactions, budgets, recurring });

describe('usageLabel', () => {
  it('ne dit rien tant que le compte n’est pas arrivé', () => {
    expect(usageLabel(undefined)).toBeNull();
  });

  it('accorde et n’ajoute budgets et récurrentes que s’il y en a', () => {
    expect(usageLabel(usage(0))).toBe('Aucune opération');
    expect(usageLabel(usage(1))).toBe('1 opération');
    expect(usageLabel(usage(12, 1, 2))).toBe('12 opérations · un budget · 2 récurrentes');
    expect(usageLabel(usage(3, 2, 1))).toBe('3 opérations · 2 budgets · 1 récurrente');
  });
});

describe('needsReplacement', () => {
  it('demande une remplaçante pour des opérations ou des récurrentes, pas pour un budget seul', () => {
    expect(needsReplacement(usage(0))).toBe(false);
    expect(needsReplacement(usage(0, 1))).toBe(false);
    expect(needsReplacement(usage(2))).toBe(true);
    expect(needsReplacement(usage(0, 0, 1))).toBe(true);
  });
});

describe('deletionSummary', () => {
  it('ne dit rien quand la suppression n’emporte rien', () => {
    expect(deletionSummary(usage(0), null)).toBeNull();
  });

  it('demande la remplaçante tant qu’elle n’est pas choisie', () => {
    expect(deletionSummary(usage(12), null)).toBe('Choisissez la catégorie qui recevra ses 12 opérations.');
  });

  it('dit où partent les opérations, au singulier comme au pluriel', () => {
    expect(deletionSummary(usage(1), 'Divers')).toBe('Son opération passera dans « Divers ».');
    expect(deletionSummary(usage(1, 0, 1), 'Divers')).toBe(
      'Son opération et son opération récurrente passeront dans « Divers ».'
    );
  });

  it('annonce la suppression du budget', () => {
    expect(deletionSummary(usage(0, 1), null)).toBe('Son budget sera supprimé.');
    expect(deletionSummary(usage(4, 2), 'Sport')).toBe(
      'Ses 4 opérations passeront dans « Sport ». Ses budgets seront supprimés.'
    );
  });
});
