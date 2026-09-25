import { anchorFor, describeRecurrence, nextDueAfter } from '@/lib/recurrence';

describe('anchorFor', () => {
  it('prend le jour du mois pour une récurrence mensuelle', () => {
    expect(anchorFor('monthly', '2026-09-05')).toBe(5);
  });

  it('ramène le 30 au 28, qui existe tous les mois', () => {
    expect(anchorFor('monthly', '2026-09-30')).toBe(28);
  });

  it('prend le jour ISO de la semaine, dimanche compris', () => {
    expect(anchorFor('weekly', '2026-09-28')).toBe(1); // lundi
    expect(anchorFor('weekly', '2026-09-27')).toBe(7); // dimanche
  });
});

describe('nextDueAfter', () => {
  it('propose le même jour le mois suivant, pas le jour même', () => {
    expect(nextDueAfter('monthly', 5, '2026-09-05')).toBe('2026-10-05');
  });

  it('reste dans le mois quand le jour d’ancrage est encore à venir', () => {
    expect(nextDueAfter('monthly', 28, '2026-09-30')).toBe('2026-10-28');
    expect(nextDueAfter('monthly', 20, '2026-09-10')).toBe('2026-09-20');
  });

  it('passe l’année', () => {
    expect(nextDueAfter('monthly', 5, '2026-12-10')).toBe('2027-01-05');
  });

  it('revient sept jours plus tard pour le même jour de la semaine', () => {
    expect(nextDueAfter('weekly', 1, '2026-09-28')).toBe('2026-10-05');
  });

  it('prend le prochain jour choisi dans la semaine', () => {
    // Vendredi 25 → dimanche 27.
    expect(nextDueAfter('weekly', 7, '2026-09-25')).toBe('2026-09-27');
  });
});

describe('describeRecurrence', () => {
  it('dit le jour du mois, en ordinal pour le premier', () => {
    expect(describeRecurrence('monthly', 5)).toBe('Chaque mois, le 5');
    expect(describeRecurrence('monthly', 1)).toBe('Chaque mois, le 1er');
  });

  it('nomme le jour de la semaine', () => {
    expect(describeRecurrence('weekly', 1)).toBe('Chaque lundi');
    expect(describeRecurrence('weekly', 7)).toBe('Chaque dimanche');
  });
});
