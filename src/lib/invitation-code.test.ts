import { formatInvitationCode, invitationMessage, sanitizeInvitationCodeInput } from './invitation-code';

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


describe('invitationMessage', () => {
  const link = 'https://example.org/join/?code=7KQ2M9XA';

  it('nomme le groupe, donne le lien, le code affiché et où le saisir', () => {
    const message = invitationMessage('Famille Nguema', '7KQ2M9XA', 7, link);
    expect(message).toContain('« Famille Nguema »');
    expect(message).toContain(link);
    expect(message).toContain('7KQ2-M9XA');
    expect(message).toContain('encore 7 jours');
    expect(message).toContain('« Rejoindre »');
    expect(message).not.toContain('une seule fois');
  });

  it('dit « jusqu’à demain » la veille de l’expiration', () => {
    expect(invitationMessage('Coloc', '7KQ2M9XA', 1, link)).toContain('jusqu’à demain');
  });

  it('prévient un lecteur de son rôle', () => {
    expect(invitationMessage('Tontine', '7KQ2M9XA', 7, link, true)).toContain('en lecture');
  });
});
