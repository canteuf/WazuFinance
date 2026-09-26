import type { Session } from '@supabase/supabase-js';
import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { deleteOwnAccount } from '@/data/account';
import { CurrentPasswordError } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';

export type AuthState = {
  session: Session | null;
  /** Vrai tant que la session persistée n'a pas été relue au démarrage. */
  isLoading: boolean;
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
};

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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

    return {
      session,
      isLoading,
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
          // Lu par le trigger handle_new_user() pour renseigner users.display_name.
          options: { data: { display_name: displayName.trim() } },
        });
        if (error) {
          throw error;
        }
        return { needsEmailConfirmation: data.session === null };
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
      },
      async deleteAccount(currentPassword) {
        await verifyPassword(currentPassword);
        await deleteOwnAccount();
        // Portée locale, pas le signOut() par défaut : sa portée globale appellerait l'API de déconnexion avec le jeton d'un utilisateur qui n'existe plus, et lèverait une erreur après une suppression réussie. La déconnexion locale efface la session stockée, sans réseau ; Stack.Protected bascule sur la connexion. Sur les autres appareils, RLS ne renvoie déjà plus rien, et le prochain rafraîchissement de jeton échoue et les déconnecte.
        await supabase.auth.signOut({ scope: 'local' });
      },
    };
  }, [session, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
