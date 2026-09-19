import {
  isSelectable,
  lastDayOf,
  monthGrid,
  monthHasSelectable,
  monthOf,
  shiftMonth,
} from '@/lib/calendar';

describe('monthGrid', () => {
  it('commence la semaine un lundi : septembre 2026 débute un mardi', () => {
    const weeks = monthGrid({ year: 2026, month: 8 });
    expect(weeks[0]).toEqual([
      null,
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
    expect(weeks).toHaveLength(5);
    expect(weeks[4]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', null, null, null, null]);
  });

  it("n'ajoute pas de semaine vide : février 2027 tient en quatre semaines", () => {
    const weeks = monthGrid({ year: 2027, month: 1 });
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0]).toBe('2027-02-01');
    expect(weeks[3][6]).toBe('2027-02-28');
  });

  it('place un mois qui commence un dimanche en dernière colonne', () => {
    // Le 1er novembre 2026 est un dimanche.
    const weeks = monthGrid({ year: 2026, month: 10 });
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks).toHaveLength(6);
  });
});

describe('navigation', () => {
  it("passe d'une année à l'autre dans les deux sens", () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('lit le mois d’une date ISO', () => {
    expect(monthOf('2026-09-19')).toEqual({ year: 2026, month: 8 });
  });

  it('connaît le dernier jour, y compris en année bissextile', () => {
    expect(lastDayOf({ year: 2028, month: 1 })).toBe('2028-02-29');
    expect(lastDayOf({ year: 2026, month: 1 })).toBe('2026-02-28');
  });
});

describe('bornes', () => {
  it('refuse un jour après la borne haute : pas d’opération future', () => {
    expect(isSelectable('2026-09-20', undefined, '2026-09-19')).toBe(false);
    expect(isSelectable('2026-09-19', undefined, '2026-09-19')).toBe(true);
  });

  it('refuse un jour avant la borne basse : une échéance est dans le futur', () => {
    expect(isSelectable('2026-09-18', '2026-09-19')).toBe(false);
  });

  it('désactive le mois suivant quand la borne haute est dans le mois courant', () => {
    expect(monthHasSelectable({ year: 2026, month: 9 }, undefined, '2026-09-19')).toBe(false);
    expect(monthHasSelectable({ year: 2026, month: 8 }, undefined, '2026-09-19')).toBe(true);
  });

  it('désactive le mois précédent quand la borne basse est dans le mois courant', () => {
    expect(monthHasSelectable({ year: 2026, month: 7 }, '2026-09-19')).toBe(false);
  });
});
