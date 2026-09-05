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
    // Dérivée de la date du jour plutôt que fixée en dur : une valeur figée
    // finirait, une fois « aujourd'hui » ou « hier », par faire échouer ce
    // test précis plutôt que celui qu'elle est censée couvrir. 400 jours
    // exclut toute coïncidence.
    const old = new Date();
    old.setDate(old.getDate() - 400);
    expect(formatOccurredOn(dateToIso(old))).toContain(String(old.getFullYear()));
  });
});
