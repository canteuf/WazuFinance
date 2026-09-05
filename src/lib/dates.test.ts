import { dateToIso, formatOccurredOn, isoToDate, todayIso } from '@/lib/dates';

describe('dates', () => {
  it('produit une date ISO sans décalage de fuseau', () => {
    expect(dateToIso(new Date(2026, 8, 4))).toBe('2026-09-04');
  });

  it('relit une date ISO en date locale', () => {
    const date = isoToDate('2026-09-04');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8);
    expect(date.getDate()).toBe(4);
  });

  it('nomme le jour même', () => {
    expect(formatOccurredOn(todayIso())).toBe("Aujourd'hui");
  });

  it('nomme la veille', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatOccurredOn(dateToIso(yesterday))).toBe('Hier');
  });

  it('formate une date plus ancienne', () => {
    expect(formatOccurredOn('2026-01-15')).toContain('2026');
  });
});
