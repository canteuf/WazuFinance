import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from '@/lib/env';
import { secureSessionStorage } from '@/lib/secure-session-storage';
import type { Database } from '@/types/database';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    // Sur le web, supabase-js utilise déjà localStorage. Sur mobile, la session est rangée dans SecureStore, chiffré par le Keystore / trousseau (voir secure-session-storage.ts).
    ...(Platform.OS === 'web' ? {} : { storage: secureSessionStorage }),
    autoRefreshToken: true,
    persistSession: true,
    // Pas de flux de callback OAuth dans l'URL sur mobile.
    detectSessionInUrl: false,
  },
});

// Rafraîchit le token tant que l'app est au premier plan, et arrête le timer en arrière-plan. À n'enregistrer qu'une fois, d'où sa place au niveau module.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
