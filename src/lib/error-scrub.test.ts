import { scrubErrorText, scrubEvent } from '@/lib/error-scrub';

describe('scrubErrorText', () => {
  it('retire la ligne refusée par une contrainte', () => {
    const text =
      'new row for relation "transactions" violates check constraint "transactions_note_length"\nFailing row contains (8c1e…, 1500.00, 2026-09-20, Marché de Mokolo, Loyer de maman).';
    const scrubbed = scrubErrorText(text);
    expect(scrubbed).toContain('violates check constraint "transactions_note_length"');
    expect(scrubbed).not.toContain('Mokolo');
    expect(scrubbed).not.toContain('1500');
  });

  it('garde le nom des colonnes d’une clé en doublon, pas leurs valeurs', () => {
    expect(scrubErrorText('Key (group_id, name)=(4f2a…, Tontine de Mama)  already exists.')).toBe(
      'Key (group_id, name)=(…)  already exists.'
    );
  });

  it('retire la valeur refusée par un type', () => {
    expect(scrubErrorText('invalid input syntax for type numeric: "12 500 FCFA"')).toBe(
      'invalid input syntax for type numeric: "…"'
    );
  });

  it('laisse intact un message sans donnée', () => {
    expect(scrubErrorText('Le remboursement dépasse ce qui reste dû.')).toBe(
      'Le remboursement dépasse ce qui reste dû.'
    );
  });
});

describe('scrubEvent', () => {
  it('retire l’objet d’erreur sérialisé et nettoie les textes', () => {
    const event = scrubEvent({
      message: 'Failing row contains (a, 900, Taxi).',
      extra: { __serialized__: { details: 'Failing row contains (a, 900, Taxi).', code: '23514' } },
      exception: { values: [{ value: 'Key (id)=(abc) already exists' }, {}] },
      tags: { where: 'app-lock-clock' },
    });

    expect(event.extra).toBeUndefined();
    expect(event.message).toBe('Failing row contains (…).');
    expect(event.exception?.values?.[0].value).toBe('Key (id)=(…) already exists');
    // Le reste de l'événement passe tel quel.
    expect(event.tags).toEqual({ where: 'app-lock-clock' });
  });
});
