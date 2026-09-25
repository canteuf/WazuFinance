import {
  daysUntilExpiry,
  formatInvitationCode,
  normalizeInvitationCode,
} from '@/lib/invitation-code';
import { initials, pairMembers, toneIndex } from '@/lib/members';

describe('initials', () => {
  it('prend les deux premiers mots', () => {
    expect(initials('Camille Martin')).toBe('CM');
    expect(initials('Jean Pierre Dupont')).toBe('JP');
  });

  it('se contente d’une lettre pour un nom d’un mot', () => {
    expect(initials('Bob')).toBe('B');
  });

  it('ignore les espaces en trop et met en majuscules', () => {
    expect(initials('  élise   roux ')).toBe('ÉR');
  });

  it('ne rend jamais une pastille vide', () => {
    expect(initials('   ')).toBe('?');
  });
});

describe('toneIndex', () => {
  it('rend toujours la même teinte pour le même nom', () => {
    expect(toneIndex('Camille Martin', 5)).toBe(toneIndex('Camille Martin', 5));
  });

  it('reste dans la palette', () => {
    for (const name of ['A', 'Bob', 'Camille Martin', 'Élise']) {
      const index = toneIndex(name, 5);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(5);
    }
  });
});

describe('pairMembers', () => {
  it('associe chaque nom à l’avatar de même position', () => {
    expect(pairMembers(['Alice', 'Bob', 'Carol'], ['a01', 'a02', 'a03'])).toEqual([
      { name: 'Alice', avatar: 'a01' },
      { name: 'Bob', avatar: 'a02' },
      { name: 'Carol', avatar: 'a03' },
    ]);
  });

  it('garde les positions quand un membre n’a pas d’avatar', () => {
    expect(pairMembers(['Alice', 'Bob', 'Carol'], ['a01', null, 'a03'])).toEqual([
      { name: 'Alice', avatar: 'a01' },
      { name: 'Bob', avatar: null },
      { name: 'Carol', avatar: 'a03' },
    ]);
  });

  it('rend null, jamais undefined, quand le tableau d’avatars est plus court', () => {
    expect(pairMembers(['Alice', 'Bob'], ['a01'])).toEqual([
      { name: 'Alice', avatar: 'a01' },
      { name: 'Bob', avatar: null },
    ]);
  });

  it('ne rend personne pour un groupe sans membre', () => {
    expect(pairMembers([], [])).toEqual([]);
  });
});

describe('formatInvitationCode', () => {
  it('coupe le code stocké en deux groupes de quatre, en majuscules', () => {
    expect(formatInvitationCode('7kq2m9xa')).toBe('7KQ2-M9XA');
  });

  it('laisse intact un code d’une autre longueur', () => {
    expect(formatInvitationCode('abc')).toBe('ABC');
  });
});

describe('normalizeInvitationCode', () => {
  it('ramène le code affiché à la forme stockée', () => {
    expect(normalizeInvitationCode('7KQ2-M9XA')).toBe('7KQ2M9XA');
  });

  it('pardonne espaces et tirets saisis à la main', () => {
    expect(normalizeInvitationCode(' 7kq2 m9xa ')).toBe('7KQ2M9XA');
  });

  it('fait l’aller-retour avec formatInvitationCode', () => {
    expect(normalizeInvitationCode(formatInvitationCode('BCDEF234'))).toBe('BCDEF234');
  });
});

describe('daysUntilExpiry', () => {
  const now = new Date('2026-09-19T12:00:00Z');

  it('arrondit au-dessus : 30 heures font 2 jours', () => {
    expect(daysUntilExpiry('2026-09-20T18:00:00Z', now)).toBe(2);
  });

  it('compte 7 jours pour une invitation toute neuve', () => {
    expect(daysUntilExpiry('2026-09-26T12:00:00Z', now)).toBe(7);
  });

  it('vaut zéro une fois expirée, jamais négatif', () => {
    expect(daysUntilExpiry('2026-09-18T12:00:00Z', now)).toBe(0);
  });
});
