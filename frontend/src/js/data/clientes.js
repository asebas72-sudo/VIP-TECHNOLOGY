import { supabase } from '../../lib/supabaseClient.js';

export async function buscarClientePorCedula(cedula) {
  const { data, error } = await supabase
    .from('clientes')
    .select('cedula, nombre, correo, celular')
    .eq('cedula', cedula)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Crea o actualiza el cliente por cédula (equivalente a upsertCliente_ de legacy/Code.js). */
export async function upsertCliente({ cedula, nombre, correo, celular }) {
  const { error } = await supabase
    .from('clientes')
    .upsert(
      { cedula, nombre, correo: correo || null, celular, ultima_visita: new Date().toISOString() },
      { onConflict: 'cedula' }
    );
  if (error) throw error;
}
