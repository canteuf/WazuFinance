import { dayTitle, groupByDay } from '@/lib/ledger';

describe('groupByDay', () => {
  it('regroupe les lignes consécutives d’un même jour, dans l’ordre reçu', () => {
    const rows = [
      { id: 'a', occurred_on: '2026-10-19' },
      { id: 'b', occurred_on: '2026-10-19' },
      { id: 'c', occurred_on: '2026-10-18' },
    ];
    expect(groupByDay(rows)).toEqual([
      { date: '2026-10-19', data: [rows[0], rows[1]] },
      { date: '2026-10-18', data: [rows[2]] },
    ]);
  });

  it('ne rend rien pour une liste vide', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('dayTitle', () => {
  const today = '2026-10-19';

  it('nomme le jour même et la veille', () => {
    expect(dayTitle('2026-10-19', today)).toBe('Aujourd’hui, 19 octobre');
    expect(dayTitle('2026-10-18', today)).toBe('Hier, 18 octobre');
  });

  it('donne la date seule au-delà', () => {
    expect(dayTitle('2026-10-15', today)).toBe('15 octobre');
  });

  it('ajoute l’année quand elle diffère', () => {
    expect(dayTitle('2025-12-24', today)).toBe('24 décembre 2025');
  });

  it('reconnaît la veille par-delà un changement d’année', () => {
    expect(dayTitle('2025-12-31', '2026-01-01')).toBe('Hier, 31 décembre 2025');
  });
});
