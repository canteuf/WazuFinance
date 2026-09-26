import { dataErrorMessage, isTransportError } from '@/lib/data-errors';

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
      'Un enregistrement identique existe déjà.'
    );
  });

  it("traduit le refus d'une invitation, levé par joinGroupWithCode", () => {
    const error = Object.assign(new Error('Invitation refusée'), { code: 'INVITATION_REJECTED' });
    expect(dataErrorMessage(error)).toBe(
      'Code invalide ou expiré. Demandez un nouveau code au propriétaire du groupe.'
    );
  });

  it("reconnaît une panne réseau à la forme réellement renvoyée par postgrest-js", () => {
    // Le client installé attrape toute panne de transport et renvoie un objet littéral, pas une Error : code vide, message préfixé par le nom de l'exception JS d'origine.
    expect(
      dataErrorMessage({
        message: 'TypeError: Network request failed',
        details: '',
        hint: '',
        code: '',
      })
    ).toBe('Pas de connexion. Réessayez.');
  });

  it("reconnaît une panne réseau du navigateur (Failed to fetch)", () => {
    expect(
      dataErrorMessage({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' })
    ).toBe('Pas de connexion. Réessayez.');
  });

  it("reconnaît aussi une vraie Error réseau", () => {
    expect(dataErrorMessage(new TypeError('Network request failed'))).toBe(
      'Pas de connexion. Réessayez.'
    );
  });

  it("un vrai SQLSTATE l'emporte toujours sur un message évoquant le réseau", () => {
    expect(
      dataErrorMessage({ code: '42501', message: 'Network request failed' })
    ).toBe("Vous n'avez pas accès à ce budget.");
  });

  it("retombe sur un message générique", () => {
    expect(dataErrorMessage({ code: 'XX999', message: 'boom' })).toBe(
      'Une erreur inattendue est survenue.'
    );
  });

  it("supporte une valeur qui n'est pas une erreur", () => {
    expect(dataErrorMessage(undefined)).toBe('Une erreur inattendue est survenue.');
  });

  it('traduit le conflit levé par une modification périmée', () => {
    const error = Object.assign(new Error('conflit'), { code: 'TRANSACTION_CONFLICT' });
    expect(dataErrorMessage(error)).toMatch(/modifiée par un autre membre/);
  });
});

describe('isTransportError', () => {
  it('reconnaît une requête restée sans réponse', () => {
    expect(isTransportError({ message: 'TypeError: Network request failed', code: '' })).toBe(true);
    expect(isTransportError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('ne prend jamais un refus de la base pour une panne réseau', () => {
    expect(isTransportError({ code: '42501', message: 'Network request failed' })).toBe(false);
    expect(isTransportError({ code: 'P0001', message: 'Le remboursement dépasse ce qui reste dû.' })).toBe(false);
    expect(isTransportError(undefined)).toBe(false);
  });
});
