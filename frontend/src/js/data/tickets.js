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
