import type { Session } from '@supabase/supabase-js';
import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

export type AuthState = {
  session: Session | null;
  /** Vrai tant que la session persistée n'a pas été relue au démarrage. */
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Renvoie `needsEmailConfirmation` : quand la confirmation d'email est
   * activée sur le projet Supabase, signUp ne crée pas de session et
   * l'utilisateur doit d'abord cliquer le lien reçu.
   */
  signUp: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
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

    // Couvre connexion, déconnexion et TOKEN_REFRESHED, y compris depuis un
    // autre onglet ou après expiration.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
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
    }),
    [session, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
