import { supabase } from '../lib/supabaseClient.js';

// Los usuarios legacy inician sesión con un "usuario" corto (ej. "Sebastian"),
// no con un correo. Supabase Auth exige un correo, así que se usa uno sintético
// y estable por convención. Se arma igual al migrar cada cuenta (ver scripts/
// migrate_xlsx_to_supabase.py) y al iniciar sesión.
function correoSintetico(usuario) {
  return String(usuario || '').trim().toLowerCase().replace(/\s+/g, '.') + '@vip.local';
}

export async function login(usuario, clave) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: correoSintetico(usuario),
    password: clave
  });
  if (error) throw new Error('Usuario o contraseña incorrectos.');

  const perfil = await obtenerPerfilActual();
  return { user: data.user, perfil };
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function obtenerSesion() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function obtenerPerfilActual() {
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from('perfiles')
    .select('id, usuario, nombre, rol, celular')
    .eq('id', uid)
    .single();

  if (error) throw error;
  return data;
}

export function esAdmin(perfil) {
  return !!perfil && String(perfil.rol).toLowerCase() === 'admin';
}
