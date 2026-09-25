import { validateRecoveryCode } from './validation';

describe('validateRecoveryCode', () => {
  it('accepte un code à 6 chiffres, espaces autour compris', () => {
    expect(validateRecoveryCode(' 123456 ')).toBeUndefined();
  });

  it('accepte un code plus long, si le projet l’a réglé ainsi', () => {
    expect(validateRecoveryCode('12345678')).toBeUndefined();
  });

  it('refuse un champ vide', () => {
    expect(validateRecoveryCode('  ')).toBe('Code requis.');
  });

  it('refuse un code trop court ou qui contient autre chose que des chiffres', () => {
    expect(validateRecoveryCode('12345')).toBe('Saisissez les chiffres du code reçu par email.');
    expect(validateRecoveryCode('12a456')).toBe('Saisissez les chiffres du code reçu par email.');
  });
});
