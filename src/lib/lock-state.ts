/**
 * Vrai tant que l'écran de verrouillage couvre l'app, ou que l'on ne sait pas encore s'il le fera (réglage pas encore relu au démarrage).
 *
 * Les alertes des écritures refusées partent du cache des mutations, hors de tout composant, souvent au démarrage, quand la file relue du disque est renvoyée. Sur Android, une `Alert` s'affiche au-dessus de la `Modal` du verrou : un tiers qui tenait le téléphone verrouillé lisait le montant, la date et la raison du refus. AppLockProvider tient ce drapeau à jour ; les saisies refusées restent dans « À corriger », visibles une fois l'app déverrouillée.
 */
let hidden = true;

export function setSensitiveAlertsHidden(value: boolean): void {
  hidden = value;
}

export function sensitiveAlertsHidden(): boolean {
  return hidden;
}
