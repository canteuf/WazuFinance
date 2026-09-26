import { randomUUID } from 'expo-crypto';
import { useCallback, useRef } from 'react';

/**
 * Identifiants de geste, tirés une fois par clé pour la vie de l'écran : renvoyer le même geste après une réponse perdue réutilise le même identifiant, que la base reconnaît au lieu de l'appliquer deux fois.
 *
 * La clé décrit le geste : le montant d'un versement (un autre montant est un autre geste, qui doit compter), l'échéance d'une récurrence (la suivante en est une autre). Même idée que l'id tiré à l'ouverture de la feuille de saisie, pour les écrans où un geste se répète.
 */
export function useRequestIds(): (key: string) => string {
  const ids = useRef(new Map<string, string>());
  return useCallback((key: string) => {
    let id = ids.current.get(key);
    if (id === undefined) {
      id = randomUUID();
      ids.current.set(key, id);
    }
    return id;
  }, []);
}
