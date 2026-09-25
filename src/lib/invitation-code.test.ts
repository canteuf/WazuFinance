import { formatInvitationCode, sanitizeInvitationCodeInput } from './invitation-code';

describe('sanitizeInvitationCodeInput', () => {
  it('garde un code déjà à la forme stockée', () => {
    expect(sanitizeInvitationCodeInput('7KQ2M9XA')).toBe('7KQ2M9XA');
  });

  it('accepte un code collé tel qu’il s’affiche, tiret et espaces compris', () => {
    expect(sanitizeInvitationCodeInput(' 7KQ2-M9XA\n')).toBe('7KQ2M9XA');
  });

  it('passe la saisie en majuscules', () => {
    expect(sanitizeInvitationCodeInput('7kq2m9xa')).toBe('7KQ2M9XA');
  });

  it('ignore les symboles absents de l’alphabet : 0, 1, I, O et la ponctuation', () => {
    expect(sanitizeInvitationCodeInput('a0b1cIdO!e')).toBe('ABCDE');
  });

  it('coupe à huit caractères', () => {
    expect(sanitizeInvitationCodeInput('7KQ2M9XAZZ')).toBe('7KQ2M9XA');
  });

  it('revient à la forme stockée depuis la forme affichée', () => {
    expect(sanitizeInvitationCodeInput(formatInvitationCode('7KQ2M9XA'))).toBe('7KQ2M9XA');
  });
});

