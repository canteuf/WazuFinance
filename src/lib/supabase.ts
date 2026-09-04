import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from '@/lib/env';
import type { Database } from '@/types/database';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    // Sur le web, supabase-js utilise déjà localStorage ; AsyncStorage ne sert
    // qu'aux plateformes natives.
    ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage }),
    autoRefreshToken: true,
    persistSession: true,
    // Pas de flux de callback OAuth dans l'URL sur mobile.
    detectSessionInUrl: false,
  },
});

// Rafraîchit le token tant que l'app est au premier plan, et arrête le timer en
// arrière-plan. À n'enregistrer qu'une fois, d'où sa place au niveau module.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
