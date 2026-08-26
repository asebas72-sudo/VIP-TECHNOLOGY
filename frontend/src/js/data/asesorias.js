import { supabase } from '../../lib/supabaseClient.js';
import { upsertCliente } from './clientes.js';
import { subirArchivo, dataUrlABlob } from '../../lib/storage.js';

function fmtFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Lista las asesorías con cliente y técnico embebidos. Igual que en Reparaciones,
 * la política RLS `asesorias_select` ya filtra "lo mío + lo sin asignar" para un
 * técnico no-admin, sin necesidad de hacerlo a mano como en legacy/Code.js.
 */
export async function listarAsesorias() {
  const { data, error } = await supabase
    .from('asesorias')
    .select(
      `id, solicitud, fallas, observaciones, imagen_url, estado, costo, observacion_final,
       celular, correo_cliente, fecha_ingreso, fecha_visita, tecnico_id,
       cliente:clientes(nombre, celular, correo)`
    )
    .order('fecha_ingreso', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Crea una solicitud de asesoría (upsert de cliente + insert). Equivalente a
 * saveAsesoria() de legacy/Code.js. El correo de notificación al cliente se
 * dispara aparte, desde la página, vía Edge Function.
 */
export async function crearAsesoria(form) {
  await upsertCliente({
    cedula: form.cedula,
    nombre: form.nombre,
    correo: form.emailUser,
    celular: form.celular
  });

  let imagenUrl = '';
  const insertBase = {
    cliente_cedula: form.cedula,
    celular: form.celular,
    correo_cliente: form.emailUser || null,
    solicitud: form.solicitud,
    fallas: form.fallas || null,
    observaciones: form.observaciones || null
  };

  const { data: asesoria, error } = await supabase
    .from('asesorias')
    .insert(insertBase)
    .select('id, fecha_ingreso')
    .single();
  if (error) throw error;

  if (form.fotoDataUrl) {
    imagenUrl = await subirArchivo(`asesorias/${asesoria.id}/foto.jpg`, dataUrlABlob(form.fotoDataUrl));
    await supabase.from('asesorias').update({ imagen_url: imagenUrl }).eq('id', asesoria.id);
  }

  const resultado = {
    ok: true,
    idAsesoria: asesoria.id,
    nombre: form.nombre,
    celular: form.celular,
    solicitud: form.solicitud,
    fechaIngreso: fmtFecha(asesoria.fecha_ingreso)
  };

  if (form.emailUser) {
    supabase.functions
      .invoke('send-asesoria-email', {
        body: {
          correo: form.emailUser,
          idAsesoria: asesoria.id,
          nombre: form.nombre,
          solicitud: form.solicitud,
          fechaIngreso: resultado.fechaIngreso
        }
      })
      .catch((err) => console.error('No se pudo enviar la notificación de asesoría:', err));
  }

  return resultado;
}

/**
 * Guarda cambios de una asesoría (estado, costo, fecha de visita, técnico,
 * observación final). Equivalente a updateAsesoriaBackend(). Si la asesoría
 * ya está REALIZADA, un trigger en la base de datos rechaza el UPDATE
 * (ver supabase/migrations/0004_asesorias_bloqueo_realizada.sql) — se
 * traduce aquí a un mensaje claro, igual que en el legacy.
 */
export async function guardarAsesoria(id, cambios) {
  const { data, error } = await supabase.from('asesorias').update(cambios).eq('id', id).select('id').maybeSingle();
  if (error) {
    if (String(error.message || '').includes('REALIZADA')) {
      throw new Error('Esta asesoría ya fue marcada como REALIZADA y no admite más ediciones.');
    }
    throw error;
  }
  if (!data) throw new Error('No tienes permiso para editar esta asesoría (está asignada a otro técnico).');
  return true;
}

/** Marca la asesoría como REALIZADA. Equivalente a actualizarEstadoAsesoria(). */
export async function marcarAsesoriaRealizada(id) {
  return guardarAsesoria(id, { estado: 'REALIZADA' });
}
