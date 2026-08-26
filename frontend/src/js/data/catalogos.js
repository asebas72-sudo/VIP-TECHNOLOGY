import { supabase } from '../../lib/supabaseClient.js';

export async function obtenerMarcas() {
  const { data, error } = await supabase
    .from('marcas')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return data;
}

export async function obtenerTiposEquipo() {
  const { data, error } = await supabase
    .from('tipos_equipo')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return data;
}

export async function obtenerTecnicos() {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, celular')
    .eq('rol', 'tecnico')
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return data;
}
