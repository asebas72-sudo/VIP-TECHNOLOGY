import { createClient } from '@supabase/supabase-js';

// Estas dos variables se definen en frontend/.env (nunca se commitean, ver .env.example)
// y en el entorno de build de GitHub Actions / Cloudflare / Vercel como secretos.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Falla rápido y con un mensaje claro en vez de un error críptico de fetch.
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia frontend/.env.example a frontend/.env y complétalo.'
  );
}

// La anon key es pública por diseño (va en el bundle del navegador): la seguridad
// real la da Supabase Auth (JWT del usuario) + las políticas RLS de supabase/migrations,
// no el secreto de esta key.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});
