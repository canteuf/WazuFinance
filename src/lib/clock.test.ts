import { clockSkewMs, formatSkew, isClockWrong, tokenIssuedAtMs } from '@/lib/clock';

/** Un jeton au format JWT, signature factice : seul le contenu compte ici. */
function token(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256' })}.${encode(payload)}.signature`;
}

const ISSUED = Date.UTC(2026, 8, 26, 10, 0, 0);

describe('tokenIssuedAtMs', () => {
  it('lit l’instant d’émission du jeton', () => {
    expect(tokenIssuedAtMs(token({ iat: ISSUED / 1000, sub: 'u1' }))).toBe(ISSUED);
  });

  it('rend null pour un jeton illisible', () => {
    expect(tokenIssuedAtMs('pas-un-jeton')).toBeNull();
    expect(tokenIssuedAtMs('a.%%%.c')).toBeNull();
    expect(tokenIssuedAtMs(token({ sub: 'u1' }))).toBeNull();
  });
});

describe('clockSkewMs', () => {
  it('mesure l’avance du téléphone', () => {
    expect(clockSkewMs(token({ iat: ISSUED / 1000 }), ISSUED + 2 * 3_600_000)).toBe(2 * 3_600_000);
  });

  it('mesure son retard', () => {
    expect(clockSkewMs(token({ iat: ISSUED / 1000 }), ISSUED - 30 * 86_400_000)).toBe(-30 * 86_400_000);
  });
});

describe('isClockWrong', () => {
  it('tolère le temps d’une requête lente', () => {
    expect(isClockWrong(40_000)).toBe(false);
    expect(isClockWrong(-4 * 60_000)).toBe(false);
    expect(isClockWrong(null)).toBe(false);
  });

  it('signale une heure fausse, en avance comme en retard', () => {
    expect(isClockWrong(2 * 3_600_000)).toBe(true);
    expect(isClockWrong(-10 * 60_000)).toBe(true);
  });
});

describe('formatSkew', () => {
  it('donne un ordre de grandeur', () => {
    expect(formatSkew(35 * 60_000)).toBe('35 min');
    expect(formatSkew(-2 * 3_600_000)).toBe('2 h');
    expect(formatSkew(30 * 86_400_000)).toBe('30 jours');
  });
});
