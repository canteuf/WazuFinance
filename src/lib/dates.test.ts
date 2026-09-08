import {
  dateToIso,
  formatOccurredOn,
  formatPeriodLabel,
  isoToDate,
  periodBounds,
  todayIso,
} from '@/lib/dates';

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

describe('periodBounds', () => {
  it('rend le mois calendaire quand la période démarre le 1er', () => {
    expect(periodBounds('2026-09-08', 1)).toEqual({ from: '2026-09-01', to: '2026-10-01' });
  });

  it('reste sur la période en cours dès le jour de démarrage', () => {
    expect(periodBounds('2026-09-03', 3)).toEqual({ from: '2026-09-03', to: '2026-10-03' });
  });

  it('recule d’un mois la veille du démarrage', () => {
    expect(periodBounds('2026-09-02', 3)).toEqual({ from: '2026-08-03', to: '2026-09-03' });
  });

  it('franchit décembre vers janvier', () => {
    expect(periodBounds('2026-12-20', 15)).toEqual({ from: '2026-12-15', to: '2027-01-15' });
  });

  it('recule sur l’année précédente en début janvier', () => {
    expect(periodBounds('2027-01-04', 15)).toEqual({ from: '2026-12-15', to: '2027-01-15' });
  });

  // 28 est le maximum autorisé en base précisément parce que février existe :
  // la borne haute doit rester le 28 mars, pas déborder.
  it('tient au plafond de 28 en passant par février', () => {
    expect(periodBounds('2026-03-01', 28)).toEqual({ from: '2026-02-28', to: '2026-03-28' });
  });
});

describe('formatPeriodLabel', () => {
  it('nomme le mois quand la période est calendaire', () => {
    expect(formatPeriodLabel('2026-09-01', '2026-10-01')).toBe('de septembre');
  });

  // La borne haute est exclue : la date affichée est la veille.
  it('affiche l’intervalle quand la période chevauche deux mois', () => {
    expect(formatPeriodLabel('2026-09-03', '2026-10-03')).toBe('du 3 sept. au 2 oct.');
  });
});
