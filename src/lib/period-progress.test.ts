import { dailyAllowance, periodProgress } from '@/lib/period-progress';

describe('periodProgress', () => {
  it('compte le premier jour de la période comme écoulé, et comme restant à couvrir', () => {
    const progress = periodProgress('2026-09-01', '2026-09-01', '2026-10-01');

    expect(progress.elapsedDays).toBe(1);
    expect(progress.totalDays).toBe(30);
    // 30 et non 29 : le jour courant est entamé, et reste à financer.
    expect(progress.remainingDays).toBe(30);
  });

  it('laisse un jour restant le dernier jour de la période', () => {
    const progress = periodProgress('2026-09-30', '2026-09-01', '2026-10-01');

    expect(progress.elapsedDays).toBe(30);
    expect(progress.remainingDays).toBe(1);
    expect(progress.ratio).toBe(1);
  });

  it('sature à la durée totale pour une date postérieure à la période', () => {
    const progress = periodProgress('2026-10-15', '2026-09-01', '2026-10-01');

    expect(progress.elapsedDays).toBe(30);
    expect(progress.remainingDays).toBe(0);
    expect(progress.ratio).toBe(1);
  });

  it('reste à zéro pour une date antérieure à la période', () => {
    const progress = periodProgress('2026-08-15', '2026-09-01', '2026-10-01');

    expect(progress.elapsedDays).toBe(0);
    // Saturé à la durée totale : rien n'est encore entamé, mais on ne promet pas plus de jours que la période n'en compte.
    expect(progress.remainingDays).toBe(30);
    expect(progress.ratio).toBe(0);
  });

  it('suit la durée réelle des mois courts', () => {
    expect(periodProgress('2026-02-01', '2026-02-01', '2026-03-01').totalDays).toBe(28);
    expect(periodProgress('2028-02-01', '2028-02-01', '2028-03-01').totalDays).toBe(29);
  });

  it('compte 31 jours sur une période décalée traversant deux mois', () => {
    // Période « paie du 27 », de septembre à octobre : 27/09 inclus au 27/10 exclu.
    const progress = periodProgress('2026-10-08', '2026-09-27', '2026-10-27');

    expect(progress.totalDays).toBe(30);
    expect(progress.elapsedDays).toBe(12);
    // 19 et non 18 : le 8 octobre compte des deux côtés.
    expect(progress.remainingDays).toBe(19);
  });

  it('ne perd pas de jour sur une période traversant le passage à l’heure d’hiver', () => {
    // En Europe, l'heure d'hiver arrive le dernier dimanche d'octobre : le 25 octobre 2026 dure 25 heures. Sans arrondi, l'écart en millisecondes divisé par 24 h rendait 30,04 jours, tronqué à 30 — et la période perdait un jour au passage.
    const progress = periodProgress('2026-10-31', '2026-10-01', '2026-11-01');

    expect(progress.totalDays).toBe(31);
    expect(progress.elapsedDays).toBe(31);
    expect(progress.remainingDays).toBe(1);
  });
});

describe('dailyAllowance', () => {
  it('répartit le reste sur les jours restants', () => {
    expect(dailyAllowance(1200, 12)).toBe(100);
  });

  it('ne rend rien quand la période est close', () => {
    expect(dailyAllowance(1200, 0)).toBeNull();
  });

  it('ne rend rien quand il ne reste rien à dépenser', () => {
    expect(dailyAllowance(0, 12)).toBeNull();
    expect(dailyAllowance(-40, 12)).toBeNull();
  });
});
