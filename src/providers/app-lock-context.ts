import { createContext } from 'react';

import type { AppLockSettings } from '@/lib/app-lock-storage';

// Contexte et types dans leur propre fichier : AppLockProvider affiche LockScreen, qui lit ce contexte par useAppLock(). Déclarés dans le fournisseur, ils formaient une boucle d'imports fournisseur → écran → hook → fournisseur.

export type PinCheck =
  | { ok: true }
  /** `waitMs` : attente imposée avant le prochain essai (0 pour les premières fautes). */
  | { ok: false; waitMs: number; signedOut: false }
  /** Trop d'échecs : le verrouillage est effacé et la session fermée. */
  | { ok: false; waitMs: 0; signedOut: true };

export type AppLockApi = {
  /** `undefined` pendant la lecture du réglage, `null` quand le verrouillage est désactivé. */
  settings: AppLockSettings | null | undefined;
  locked: boolean;
  /** Le téléphone a une empreinte ou un visage enregistré. */
  biometricsAvailable: boolean;
  checkPin: (pin: string) => Promise<PinCheck>;
  unlock: () => void;
  unlockWithBiometrics: () => Promise<boolean>;
  enable: (pin: string) => Promise<void>;
  changePin: (pin: string) => Promise<void>;
  disable: () => Promise<void>;
  setBiometrics: (on: boolean) => Promise<boolean>;
  /** « Code oublié » : efface le verrouillage et déconnecte ; le mot de passe du compte permet de revenir. */
  forget: () => Promise<void>;
};

export const AppLockContext = createContext<AppLockApi | null>(null);
