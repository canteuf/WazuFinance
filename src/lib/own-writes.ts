/** Durée pendant laquelle l'écho Realtime d'une écriture de ce téléphone est ignoré. Large devant le délai de Realtime, court devant l'écriture suivante d'un autre membre sur la même ligne. */
export const OWN_WRITE_ECHO_MS = 10_000;

/**
 * Les opérations que ce téléphone vient d'écrire, avec l'instant de la réponse.
 *
 * Chaque saisie rechargeait tout deux fois : une fois par son propre succès, une fois 1,5 s plus tard par l'écho Realtime de sa propre ligne — 15 à 25 requêtes à chaque vague sur une 2G. L'écho d'une ligne écrite ici est désormais ignoré : le succès a déjà rechargé.
 */
export class OwnWrites {
  private readonly at = new Map<string, number>();

  record(id: string, now: number = Date.now()): void {
    this.at.set(id, now);
    for (const [key, time] of this.at) {
      if (now - time > OWN_WRITE_ECHO_MS) {
        this.at.delete(key);
      }
    }
  }

  isEcho(id: unknown, now: number = Date.now()): boolean {
    if (typeof id !== 'string') {
      return false;
    }
    const time = this.at.get(id);
    return time !== undefined && now - time <= OWN_WRITE_ECHO_MS;
  }
}

/** Partagé entre les écritures de la file (use-transaction-mutations) et l'abonnement Realtime (use-transactions-realtime). */
export const ownTransactionWrites = new OwnWrites();
