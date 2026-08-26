// Supabase Edge Function (Deno) — reemplaza a enviarNotificacionVIP() de legacy/Code.js
//
// Se invoca desde el frontend justo después de insertar un registro en `tickets`:
//   await supabase.functions.invoke('send-ingreso-email', { body: { ...datosDelTicket } })
//
// Requiere el secreto RESEND_API_KEY configurado en el proyecto de Supabase:
//   supabase secrets set RESEND_API_KEY=tu_api_key
// (Resend tiene un free tier de 3000 correos/mes — ver https://resend.com)

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('NOTIFICACIONES_FROM') || 'VIP TECHNOLOGY <notificaciones@resend.dev>';

interface PayloadIngreso {
  correo: string;
  codigo: string;
  nombre: string;
  equipo: string;
  fechaIngreso: string;
  imagenUrl?: string;
}

function construirTablaHTML(ticket: PayloadIngreso): string {
  const fila = (label: string, valor: string) => `
    <tr>
      <td style="padding:10px 16px;background:#eef1f6;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;color:#475569;width:140px;">${label}</td>
      <td style="padding:10px 16px;background:#ffffff;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:14px;font-weight:600;color:#0f172a;">${valor || '—'}</td>
    </tr>`;

  const filaImagen = ticket.imagenUrl
    ? `<tr><td colspan="2" style="padding:14px 16px;text-align:center;background:#ffffff;">
         <img src="${ticket.imagenUrl}" width="220" style="max-width:100%;border-radius:8px;border:1px solid #e2e8f0;" alt="Foto del equipo">
       </td></tr>`
    : '';

  return `
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:420px;border-collapse:collapse;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;font-family:Arial,sans-serif;">
      <tr><td colspan="2" style="background:#7e22ce;padding:14px 16px;">
        <span style="color:#ffffff;font-size:15px;font-weight:bold;">VIP TECHNOLOGY · Ficha de ingreso</span>
      </td></tr>
      ${fila('Código', `<span style="font-family:monospace;font-weight:bold;color:#7e22ce;">${ticket.codigo || '—'}</span>`)}
      ${fila('Cliente', ticket.nombre)}
      ${fila('Equipo', ticket.equipo)}
      ${fila('Fecha de ingreso', ticket.fechaIngreso)}
      ${filaImagen}
    </table>`;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'RESEND_API_KEY no configurado.' }), { status: 500 });
  }

  const ticket = (await req.json()) as PayloadIngreso;
  if (!ticket?.correo) {
    return new Response(JSON.stringify({ ok: false, error: 'Correo vacío.' }), { status: 400 });
  }

  const tablaHTML = construirTablaHTML(ticket);
  const cuerpoHTML = `
    Hola,<br><br>Has recibido una nueva notificación de VIPTECHNOLOGY.<br><br>
    TU COMPUTADOR ESTA EN ESTADO: <b>INGRESADO</b><br><br>${tablaHTML}<br>
    <b>TE RECORDAMOS:</b><br><br>
    * Toda revisión cuesta <b>$20.000 MIL PESOS</b> siempre y cuando no desee arreglar el equipo tecnológico.<br><br>
    * Presentar código enviado a su Email - WhatsApp al momento de reclamarlo.<br><br>
    <b>CODIGO: ${ticket.codigo}</b><br><br>
    <b>IMPORTANTE:</b><br><br>
    Tener presente que el equipo debe ser reclamado en un tiempo inferior a 30 días. Pasado este tiempo se cobrará por día un valor de <b>$1000 MIL PESOS</b> por concepto de bodegaje y no se responde por él.<br><br>
    <b>¡¡PRONTO RECIBIRAS AVANCES SOBRE TU EQUIPO TECNOLOGICO!!</b>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: ticket.correo,
      subject: 'VIPTECHNOLOGY - NOTIFICACION',
      html: cuerpoHTML
    })
  });

  if (!resp.ok) {
    const detalle = await resp.text();
    return new Response(JSON.stringify({ ok: false, error: detalle }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
