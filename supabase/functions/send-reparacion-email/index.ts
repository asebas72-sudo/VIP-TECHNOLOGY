// Supabase Edge Function (Deno) — reemplaza a enviarCorreoReparacionBackend() de legacy/Code.js
// Correo genérico de actualización (el frontend arma el asunto/cuerpo según los cambios del ticket).
// Invocación: supabase.functions.invoke('send-reparacion-email', { body: { destinatario, asunto, cuerpo } })

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('NOTIFICACIONES_FROM') || 'VIP TECHNOLOGY <notificaciones@resend.dev>';

interface PayloadReparacion {
  destinatario: string;
  asunto?: string;
  cuerpo: string;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'RESEND_API_KEY no configurado.' }), { status: 500 });
  }

  const datos = (await req.json()) as PayloadReparacion;
  if (!datos?.destinatario) {
    return new Response(JSON.stringify({ ok: false, error: 'No se proporcionó un correo destinatario.' }), {
      status: 400
    });
  }

  const asunto = datos.asunto || 'Actualización de su reparación';
  const cuerpoHTML = `
    <div style="font-family:Arial,sans-serif;max-width:480px;">
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;">
        <tr><td style="background:#7e22ce;padding:14px 16px;">
          <span style="color:#ffffff;font-size:15px;font-weight:bold;">VIP TECHNOLOGY · Actualización de su equipo</span>
        </td></tr>
        <tr><td style="padding:18px 16px;background:#ffffff;font-size:14px;color:#0f172a;line-height:1.5;">
          ${(datos.cuerpo || '').replace(/\n/g, '<br>')}
        </td></tr>
      </table>
    </div>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: datos.destinatario,
      subject: asunto,
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
