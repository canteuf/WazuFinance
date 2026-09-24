import { formatInvitationCode, sanitizeInvitationCodeInput } from './invitation-code';

describe('sanitizeInvitationCodeInput', () => {
  it('garde un code déjà à la forme stockée', () => {
    expect(sanitizeInvitationCodeInput('a3f09b12')).toBe('a3f09b12');
  });

  it('accepte un code collé tel qu’il s’affiche, tiret et espaces compris', () => {
    expect(sanitizeInvitationCodeInput(' A3F0-9B12\n')).toBe('a3f09b12');
  });

  it('ignore les caractères hors de l’hexadécimal', () => {
    expect(sanitizeInvitationCodeInput('a3g!z0')).toBe('a30');
  });

  it('coupe à huit caractères', () => {
    expect(sanitizeInvitationCodeInput('a3f09b12ff')).toBe('a3f09b12');
  });

  it('revient à la forme stockée depuis la forme affichée', () => {
    expect(sanitizeInvitationCodeInput(formatInvitationCode('a3f09b12'))).toBe('a3f09b12');
  });
});
