import {
  formatWait,
  isGuessablePin,
  isValidPin,
  LOCK_AFTER_MS,
  lockoutDelayMs,
  lockoutRemainingMs,
  shouldLockOnReturn,
} from '@/lib/app-lock';

describe('isValidPin', () => {
  it('accepte exactement quatre chiffres', () => {
    expect(isValidPin('0427')).toBe(true);
    expect(isValidPin('042')).toBe(false);
    expect(isValidPin('04271')).toBe(false);
    expect(isValidPin('04a7')).toBe(false);
  });
});

describe('isGuessablePin', () => {
  it('refuse les répétitions et les suites', () => {
    for (const pin of ['0000', '1111', '1234', '6789', '4321', '9876']) {
      expect(isGuessablePin(pin)).toBe(true);
    }
  });

  it('accepte un code ordinaire', () => {
    for (const pin of ['0427', '1357', '2580', '1123']) {
      expect(isGuessablePin(pin)).toBe(false);
    }
  });
});

describe('shouldLockOnReturn', () => {
  it('ne verrouille pas un retour rapide', () => {
    expect(shouldLockOnReturn(1_000, 1_000 + LOCK_AFTER_MS - 1)).toBe(false);
  });

  it('verrouille à partir d’une minute hors de l’app', () => {
    expect(shouldLockOnReturn(1_000, 1_000 + LOCK_AFTER_MS)).toBe(true);
  });

  it('ne verrouille pas sans passage en arrière-plan', () => {
    expect(shouldLockOnReturn(null, 10 * LOCK_AFTER_MS)).toBe(false);
  });
});

describe('lockoutDelayMs', () => {
  it('laisse passer les quatre premières fautes de frappe', () => {
    for (const failures of [0, 1, 2, 3, 4]) {
      expect(lockoutDelayMs(failures)).toBe(0);
    }
  });

  it('allonge l’attente ensuite, puis plafonne', () => {
    expect(lockoutDelayMs(5)).toBe(30_000);
    expect(lockoutDelayMs(6)).toBe(60_000);
    expect(lockoutDelayMs(7)).toBe(300_000);
    expect(lockoutDelayMs(8)).toBe(900_000);
    expect(lockoutDelayMs(9)).toBe(900_000);
  });
});

describe('lockoutRemainingMs', () => {
  it('compte à partir du dernier échec', () => {
    expect(lockoutRemainingMs(5, 10_000, 20_000)).toBe(20_000);
    expect(lockoutRemainingMs(5, 10_000, 50_000)).toBe(0);
  });

  it('ne bloque rien sans échec enregistré', () => {
    expect(lockoutRemainingMs(7, null, 0)).toBe(0);
  });

  it('n’attend jamais plus que le délai dû quand l’horloge a reculé', () => {
    const lastFailureAt = Date.UTC(2026, 8, 26);
    const clockPushedBackAMonth = lastFailureAt - 30 * 24 * 60 * 60 * 1000;
    expect(lockoutRemainingMs(5, lastFailureAt, clockPushedBackAMonth)).toBe(30_000);
    expect(lockoutRemainingMs(8, lastFailureAt, clockPushedBackAMonth)).toBe(15 * 60_000);
  });
});

describe('formatWait', () => {
  it('arrondit au-dessus', () => {
    expect(formatWait(29_001)).toBe('30 s');
    expect(formatWait(60_000)).toBe('1 min');
    expect(formatWait(61_000)).toBe('2 min');
  });
});
