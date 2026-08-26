import { supabase } from '../../lib/supabaseClient.js';
import { upsertCliente } from './clientes.js';
import { subirArchivo, dataUrlABlob } from '../../lib/storage.js';

function fmtFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Crea un ingreso completo: upsert de cliente, inserta el ticket (el código
 * y la fecha de entrega los calcula el trigger de la base de datos), sube
 * firma/foto a Storage, actualiza el ticket con esas URLs y dispara el
 * correo de notificación. Equivalente a saveIngreso() de legacy/Code.js.
 */
export async function crearIngreso(form) {
  await upsertCliente({
    cedula: form.cedula,
    nombre: form.nombre,
    correo: form.emailUser,
    celular: form.celular
  });

  const { data: ticket, error: errInsert } = await supabase
    .from('tickets')
    .insert({
      cliente_cedula: form.cedula,
      celular: form.celular,
      correo_cliente: form.emailUser || null,
      equipo: form.equipo,
      tipo_equipo_id: form.tipoEquipoId,
      marca_id: form.marcaId,
      accesorios: form.accesorios || [],
      fallas: form.fallas || null,
      observaciones: form.observaciones || null
    })
    .select('id, codigo, fecha_ingreso, fecha_entrega_estimada')
    .single();

  if (errInsert) throw errInsert;

  const actualizaciones = {};

  if (form.firmaDataUrl) {
    actualizaciones.firma_url = await subirArchivo(
      `${ticket.codigo}/firma.png`,
      dataUrlABlob(form.firmaDataUrl)
    );
  }
  if (form.fotoDataUrl) {
    actualizaciones.imagen_recepcion_url = await subirArchivo(
      `${ticket.codigo}/equipo.jpg`,
      dataUrlABlob(form.fotoDataUrl)
    );
  }

  if (Object.keys(actualizaciones).length) {
    const { error: errUpdate } = await supabase.from('tickets').update(actualizaciones).eq('id', ticket.id);
    if (errUpdate) throw errUpdate;
  }

  const resultado = {
    ok: true,
    id: ticket.id,
    codigo: ticket.codigo,
    nombre: form.nombre,
    celular: form.celular,
    equipo: form.equipo,
    fechaIngreso: fmtFecha(ticket.fecha_ingreso),
    fechaEntrega: fmtFecha(ticket.fecha_entrega_estimada)
  };

  if (form.emailUser) {
    // No debe tumbar el flujo si el correo falla (igual que en legacy, que solo loguea el error).
    supabase.functions
      .invoke('send-ingreso-email', {
        body: {
          correo: form.emailUser,
          codigo: ticket.codigo,
          nombre: form.nombre,
          equipo: form.equipo,
          fechaIngreso: resultado.fechaIngreso,
          imagenUrl: actualizaciones.imagen_recepcion_url || ''
        }
      })
      .catch((err) => console.error('No se pudo enviar la notificación por correo:', err));
  }

  return resultado;
}

/**
 * Lista los tickets con todo lo que necesita el dashboard de Reparaciones.
 * No hay que filtrar "solo mis tickets" a mano como en legacy/Code.js
 * (getReparacionesBackend): la política RLS `tickets_select` ya solo
 * devuelve lo que el usuario logueado puede ver (todo si es admin,
 * lo suyo + lo sin asignar si es técnico).
 */
export async function listarTickets() {
  const { data, error } = await supabase
    .from('tickets')
    .select(
      `id, codigo, estado, equipo, fallas, observaciones, accesorios,
       celular, correo_cliente, costo, observacion_final, comentario_1, comentario_2,
       firma_url, imagen_recepcion_url, fecha_ingreso, fecha_reparacion, fecha_entrega_estimada,
       tecnico_id,
       cliente:clientes(nombre, celular, correo),
       marca:marcas(nombre),
       tipo:tipos_equipo(nombre),
       tecnico:perfiles(nombre, celular),
       fotos:ticket_fotos(id, url, orden)`
    )
    .order('fecha_ingreso', { ascending: false });

  if (error) throw error;
  return (data || []).map((t) => ({ ...t, fotos: (t.fotos || []).sort((a, b) => a.orden - b.orden) }));
}

const MAX_FOTOS = 5;

/**
 * Guarda la ficha técnica de un ticket: campos editables + gestión de fotos
 * (mantiene las que el técnico no quitó, sube las nuevas, borra las quitadas).
 * Equivalente a updateReparacionBackend() de legacy/Code.js.
 *
 * @param {object} params
 * @param {number} params.ticketId
 * @param {string} params.codigo
 * @param {object} params.cambios          campos planos para tickets.update()
 * @param {{id:number,url:string}[]} params.fotosOriginales  lo que ya había antes de abrir el modal
 * @param {{id:number,url:string}[]} params.fotosAConservar  subconjunto de las originales que el técnico dejó
 * @param {Blob[]} params.fotosNuevas
 */
export async function guardarFichaReparacion({ ticketId, codigo, cambios, fotosOriginales, fotosAConservar, fotosNuevas }) {
  const idsConservar = new Set((fotosAConservar || []).map((f) => f.id));
  const fotosABorrar = (fotosOriginales || []).filter((f) => !idsConservar.has(f.id));

  if (fotosABorrar.length) {
    await supabase
      .from('ticket_fotos')
      .delete()
      .in(
        'id',
        fotosABorrar.map((f) => f.id)
      );
  }

  const cupoDisponible = MAX_FOTOS - (fotosAConservar || []).length;
  const aSubir = (fotosNuevas || []).slice(0, Math.max(cupoDisponible, 0));
  let ordenSiguiente = (fotosAConservar || []).reduce((max, f) => Math.max(max, f.orden || 0), 0) + 1;

  for (const blob of aSubir) {
    const url = await subirArchivo(`${codigo}/reparacion-${Date.now()}-${ordenSiguiente}.jpg`, blob);
    const { error: errFoto } = await supabase
      .from('ticket_fotos')
      .insert({ ticket_id: ticketId, url, orden: ordenSiguiente });
    if (errFoto) throw errFoto;
    ordenSiguiente += 1;
  }

  const { data, error } = await supabase.from('tickets').update(cambios).eq('id', ticketId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('No tienes permiso para editar este ticket (está asignado a otro técnico).');
  }

  return { ok: true };
}
