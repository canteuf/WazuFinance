import type { Session } from '@supabase/supabase-js';
import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';

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
  signOut: () => Promise<void>;
  /** Lève `CurrentPasswordError` si le mot de passe actuel est faux ; les autres refus (`weak_password`, `same_password`) passent par `authErrorMessage`. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Lève `CurrentPasswordError` si le mot de passe est faux ; le refus de la base (groupe partagé encore peuplé) remonte en `P0001`. */
  deleteAccount: (currentPassword: string) => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) {
          throw error;
        }
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
