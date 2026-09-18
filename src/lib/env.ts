/**
 * Variables d'environnement publiques.
 *
 * Le bundler Expo remplace `process.env.EXPO_PUBLIC_*` à la compilation, et uniquement en notation pointée : ni destructuration, ni accès dynamique. D'où les deux lectures littérales ci-dessous.
 *
 * Ces valeurs finissent en clair dans le bundle. C'est acceptable pour l'URL et la clé anon, qui sont conçues pour être publiques : la sécurité repose sur les policies RLS, pas sur le secret de la clé. Aucune clé service_role ici.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name}. ` +
        'Copiez .env.example vers .env, renseignez les valeurs du projet Supabase, ' +
        'puis relancez `npx expo start --clear`.'
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required(supabaseUrl, 'EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: required(supabaseAnonKey, 'EXPO_PUBLIC_SUPABASE_ANON_KEY'),
} as const;
