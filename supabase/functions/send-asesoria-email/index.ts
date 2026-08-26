// Supabase Edge Function (Deno) — reemplaza a enviarNotificacionAsesoria() de legacy/Code.js
// Invocación: supabase.functions.invoke('send-asesoria-email', { body: { ...datosAsesoria } })
// Requiere el mismo secreto RESEND_API_KEY que send-ingreso-email.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('NOTIFICACIONES_FROM') || 'VIP TECHNOLOGY <notificaciones@resend.dev>';

interface PayloadAsesoria {
  correo: string;
  idAsesoria: number | string;
  nombre: string;
  solicitud: string;
  fechaIngreso: string;
}

function construirTablaHTML(a: PayloadAsesoria): string {
  const fila = (label: string, valor: string) => `
    <tr>
      <td style="padding:10px 16px;background:#eef1f6;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;color:#475569;width:140px;">${label}</td>
      <td style="padding:10px 16px;background:#ffffff;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:14px;font-weight:600;color:#0f172a;">${valor || '—'}</td>
    </tr>`;

  return `
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:420px;border-collapse:collapse;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;font-family:Arial,sans-serif;">
      <tr><td colspan="2" style="background:#7e22ce;padding:14px 16px;">
        <span style="color:#ffffff;font-size:15px;font-weight:bold;">VIP TECHNOLOGY · Solicitud de asesoría</span>
      </td></tr>
      ${fila('ID', `<span style="font-family:monospace;font-weight:bold;color:#7e22ce;">#${a.idAsesoria ?? '—'}</span>`)}
      ${fila('Cliente', a.nombre)}
      ${fila('Solicitud', a.solicitud)}
      ${fila('Fecha de solicitud', a.fechaIngreso)}
    </table>`;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'RESEND_API_KEY no configurado.' }), { status: 500 });
  }

  const a = (await req.json()) as PayloadAsesoria;
  if (!a?.correo) {
    return new Response(JSON.stringify({ ok: false, error: 'Correo vacío.' }), { status: 400 });
  }

  const tablaHTML = construirTablaHTML(a);
  const cuerpoHTML = `
    Hola,<br><br>Tu solicitud de asesoría en VIPTECHNOLOGY fue registrada.<br><br>
    ${tablaHTML}<br>
    <b>Pronto confirmaremos contigo los detalles de la visita.</b>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: a.correo,
      subject: 'VIPTECHNOLOGY - ASESORÍA AGENDADA',
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
