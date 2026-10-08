import type { Session } from '@supabase/supabase-js';
import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { deleteOwnAccount } from '@/data/account';
import { CurrentPasswordError } from '@/lib/auth-errors';
import { clockSkewMs as measureClockSkew } from '@/lib/clock';
import { TERMS_VERSION } from '@/lib/legal';
import { reportError } from '@/lib/monitoring';
import type { Usage } from '@/lib/onboarding';
import { clearExportedFiles } from '@/lib/save-file';
import { supabase } from '@/lib/supabase';

export type AuthState = {
  session: Session | null;
  /** Vrai tant que la session persistée n'a pas été relue au démarrage. */
  isLoading: boolean;
  /** Décalage de l'horloge du téléphone sur celle du serveur, mesuré au dernier jeton reçu (`src/lib/clock.ts`) ; `null` tant qu'aucun jeton neuf n'est arrivé depuis le lancement. */
  clockSkewMs: number | null;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Renvoie `needsEmailConfirmation` : quand la confirmation d'email est activée sur le projet Supabase, signUp ne crée pas de session et l'utilisateur doit d'abord cliquer le lien reçu.
   */
  signUp: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<{ needsEmailConfirmation: boolean }>;
  /** `local` : efface la session de ce téléphone seulement, sans appel réseau — pour le verrouillage de l'app, qui doit pouvoir déconnecter hors ligne. */
  signOut: (options?: { local?: boolean }) => Promise<void>;
  /** Envoie par email un code de réinitialisation du mot de passe. Réussit aussi pour une adresse inconnue : Supabase ne dit pas si un compte existe. */
  sendPasswordResetCode: (email: string) => Promise<void>;
  /** Vérifie le code reçu, puis enregistre le nouveau mot de passe ; l'utilisateur est connecté à la fin. */
  resetPasswordWithCode: (email: string, code: string, newPassword: string) => Promise<void>;
  /** Lève `CurrentPasswordError` si le mot de passe actuel est faux ; les autres refus (`weak_password`, `same_password`) passent par `authErrorMessage`. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Lève `CurrentPasswordError` si le mot de passe est faux ; le refus de la base (groupe partagé encore peuplé) remonte en `P0001`. */
  deleteAccount: (currentPassword: string) => Promise<void>;
  /** Enregistre l'acceptation des CGU et de la politique en vigueur (`TERMS_VERSION`) sur le compte. La session suivante la porte, et l'écran d'acceptation se ferme de lui-même. */
  acceptTerms: () => Promise<void>;
  /** Clôt l'accueil d'un nouveau compte (`onboarding_pending` à faux), avec l'usage déclaré s'il y en a un. */
  completeOnboarding: (usage: Usage | null) => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [clockSkewMs, setClockSkewMs] = useState<number | null>(null);
  // Vrai pendant une réinitialisation de mot de passe : voir `resetPasswordWithCode`.
  const recovering = useRef(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      setSession(data.session);
      setIsLoading(false);
    });

    // Couvre connexion, déconnexion et TOKEN_REFRESHED, y compris depuis un autre onglet ou après expiration.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Seul un jeton qui vient d'être émis dit l'heure du serveur : celui relu du stockage au démarrage (INITIAL_SESSION) date de sa dernière émission.
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && nextSession) {
        setClockSkewMs(measureClockSkew(nextSession.access_token, Date.now()));
      }
      // Toute fin de session — volontaire, verrou, suppression du compte, jeton expiré — efface les relevés et l'export des données restés dans le cache.
      if (event === 'SIGNED_OUT') {
        void clearExportedFiles();
      }
      if (recovering.current) {
        return;
      }
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => {
    /**
     * Redemande le mot de passe avant une action sensible, en se reconnectant avec lui.
     *
     * Protège contre un téléphone déverrouillé laissé sans surveillance, pas contre un jeton de session volé — un tel jeton permet déjà tout le reste, et ce n'est pas la menace visée.
     *
     * Effet de bord accepté : la vérification ouvre une nouvelle session pour le même utilisateur. `onAuthStateChange` la reçoit, et `usePersistedQueryCache()` ne vide rien puisque l'identifiant ne change pas.
     */
    async function verifyPassword(password: string): Promise<void> {
      const email = session?.user.email;
      if (!email) {
        throw new CurrentPasswordError();
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.code === 'invalid_credentials') {
          throw new CurrentPasswordError();
        }
        throw error;
      }
    }

    /**
     * Ferme toutes les sessions du compte sauf celle de ce téléphone, après un nouveau mot de passe.
     *
     * Un mot de passe changé parce qu'il a fuité, ou repris par réinitialisation sur un compte qu'un tiers avait inscrit avec cette adresse, laissait la session de ce tiers ouverte : son jeton de rafraîchissement continuait de lire les comptes. Les autres appareils sont déconnectés à leur prochain rafraîchissement de jeton.
     *
     * Un échec ne fait pas échouer l'action : le mot de passe est déjà enregistré, et une erreur affichée laisserait croire le contraire.
     */
    async function signOutOtherSessions(): Promise<void> {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) {
        reportError(error, 'sign-out-others');
      }
    }

    return {
      session,
      isLoading,
      clockSkewMs,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          throw error;
        }
      },
      async signUp(email, password, displayName) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          // display_name est lu par le trigger handle_new_user() pour renseigner users.display_name. terms_version : la case « j'accepte » de l'écran d'inscription, dans la même requête que le compte.
          // onboarding_pending : seul un compte créé par cette version passe par l'accueil (voir src/lib/onboarding.ts).
          options: {
            data: { display_name: displayName.trim(), terms_version: TERMS_VERSION, onboarding_pending: true },
          },
        });
        if (error) {
          throw error;
        }
        return { needsEmailConfirmation: data.session === null };
      },
      async acceptTerms() {
        // Fusionnée dans user_metadata : display_name et le reste sont conservés. L'événement USER_UPDATED qui suit porte la nouvelle session.
        const { error } = await supabase.auth.updateUser({ data: { terms_version: TERMS_VERSION } });
        if (error) {
          throw error;
        }
      },
      async completeOnboarding(usage) {
        const { error } = await supabase.auth.updateUser({
          data: { onboarding_pending: false, ...(usage ? { usage } : {}) },
        });
        if (error) {
          throw error;
        }
      },
      async signOut(options) {
        const { error } = await supabase.auth.signOut(options?.local ? { scope: 'local' } : undefined);
        if (error) {
          throw error;
        }
      },
      async sendPasswordResetCode(email) {
        // Pas de `redirectTo` : le modèle d'email « Reset password » du projet envoie le code ({{ .Token }}), pas un lien, et l'app n'a rien à ouvrir depuis le navigateur.
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) {
          throw error;
        }
      },
      /**
       * Le code vérifié ouvre aussitôt une session. Transmise telle quelle, elle ferait basculer la garde du layout racine sur (app) et démonterait l'écran avant que le nouveau mot de passe soit enregistré — un refus de `updateUser` ne pourrait plus s'afficher, et l'utilisateur entrerait sans savoir quel mot de passe vaut. `recovering` retient donc la session jusqu'au bout.
       *
       * Si `updateUser` échoue, la session ouverte par le code est refermée : l'utilisateur reste sur l'écran, voit l'erreur, et demande un nouveau code (le premier est consommé). `same_password` n'est pas un échec : le mot de passe voulu est déjà le bon.
       */
      async resetPasswordWithCode(email, code, newPassword) {
        recovering.current = true;
        try {
          const { error } = await supabase.auth.verifyOtp({
            email: email.trim(),
            token: code,
            type: 'recovery',
          });
          if (error) {
            throw error;
          }
          const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
          if (updateError && updateError.code !== 'same_password') {
            await supabase.auth.signOut({ scope: 'local' });
            throw updateError;
          }
          await signOutOtherSessions();
        } finally {
          recovering.current = false;
        }
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
      },
      async changePassword(currentPassword, newPassword) {
        await verifyPassword(currentPassword);
        // Si l'option « Secure password change » est activée sur le projet, la connexion qui vient d'avoir lieu satisfait son exigence de connexion récente.
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
          throw error;
        }
        await signOutOtherSessions();
      },
      async deleteAccount(currentPassword) {
        await verifyPassword(currentPassword);
        await deleteOwnAccount();
        // Portée locale, pas le signOut() par défaut : sa portée globale appellerait l'API de déconnexion avec le jeton d'un utilisateur qui n'existe plus, et lèverait une erreur après une suppression réussie. La déconnexion locale efface la session stockée, sans réseau ; Stack.Protected bascule sur la connexion. Sur les autres appareils, RLS ne renvoie déjà plus rien, et le prochain rafraîchissement de jeton échoue et les déconnecte.
        await supabase.auth.signOut({ scope: 'local' });
      },
    };
  }, [session, isLoading, clockSkewMs]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
