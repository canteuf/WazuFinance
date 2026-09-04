import { dataErrorMessage } from '@/lib/data-errors';

describe('dataErrorMessage', () => {
  it("traduit un refus de RLS", () => {
    expect(dataErrorMessage({ code: '42501', message: 'permission denied' })).toBe(
      "Vous n'avez pas accès à ce budget."
    );
  });

  it("traduit une clé étrangère rompue", () => {
    expect(dataErrorMessage({ code: '23503', message: 'violates foreign key' })).toBe(
      "Cette catégorie n'existe plus."
    );
  });

  it("traduit une contrainte de vérification", () => {
    expect(dataErrorMessage({ code: '23514', message: 'violates check' })).toBe(
      'Montant invalide.'
    );
  });

  it("traduit un doublon", () => {
    expect(dataErrorMessage({ code: '23505', message: 'duplicate key' })).toBe(
      "Cette opération existe déjà."
    );
  });

  it("reconnaît une panne réseau", () => {
    expect(dataErrorMessage(new TypeError('Network request failed'))).toBe(
      'Pas de connexion. Réessayez.'
    );
  });

  it("retombe sur un message générique", () => {
    expect(dataErrorMessage({ code: 'XX999', message: 'boom' })).toBe(
      'Une erreur inattendue est survenue.'
    );
  });

  it("supporte une valeur qui n'est pas une erreur", () => {
    expect(dataErrorMessage(undefined)).toBe('Une erreur inattendue est survenue.');
  });
});
