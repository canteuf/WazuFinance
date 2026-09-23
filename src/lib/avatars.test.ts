import { AVATAR_ID_PATTERN, AVATAR_IDS, parseAvatarId } from '@/lib/avatars';

describe('AVATAR_IDS', () => {
  it('respecte le format que la base accepte', () => {
    for (const id of AVATAR_IDS) {
      expect(id).toMatch(AVATAR_ID_PATTERN);
    }
  });

  it('ne contient aucun doublon', () => {
    expect(new Set(AVATAR_IDS).size).toBe(AVATAR_IDS.length);
  });

  it('a une image livrée pour chaque identifiant', () => {
    for (const id of AVATAR_IDS) {
      // Sous jest-expo, le require d'une image renvoie un simple stub, mais lève si le fichier n'existe pas : c'est ce qui compte ici.
      expect(() => jest.requireActual(`../../assets/avatars/${id}.png`)).not.toThrow();
    }
  });
});

describe('parseAvatarId', () => {
  it('relit un identifiant connu', () => {
    expect(parseAvatarId('a01')).toBe('a01');
    expect(parseAvatarId('a16')).toBe('a16');
  });

  it('retombe sur les initiales quand rien n’est choisi', () => {
    expect(parseAvatarId(null)).toBeNull();
    expect(parseAvatarId(undefined)).toBeNull();
    expect(parseAvatarId('')).toBeNull();
  });

  it('retombe sur les initiales sur un identifiant que cette version ne connaît pas', () => {
    // Bien formé pour la base, mais posé par une version plus récente de l'app.
    expect(parseAvatarId('a99')).toBeNull();
    expect(parseAvatarId('A01')).toBeNull();
    expect(parseAvatarId('a1')).toBeNull();
  });
});
