/**
 * Props partagées entre les deux variantes de DateField (native et web).
 *
 * Extrait dans son propre module plutôt que dupliqué : nommer ce fichier autrement que `date-field.*` lui évite de participer à la résolution de plateforme de Metro, qui ne regarde que le nom du fichier du composant.
 */
export type DateFieldProps = {
  /** Date choisie, au format ISO `YYYY-MM-DD`. */
  value: string;
  /** Texte déjà formaté à afficher (« Aujourd'hui », « Hier », ...). */
  label: string;
  onChange: (iso: string) => void;
  /** Borne haute du sélecteur : pas d'opération future dans un suivi de dépenses. */
  maximumDate?: Date;
  /** Borne basse : une échéance d'objectif d'épargne va dans l'autre sens. */
  minimumDate?: Date;
};
