import { listarTickets, guardarFichaReparacion } from '../data/tickets.js';
import { obtenerTecnicos } from '../data/catalogos.js';
import { supabase } from '../../lib/supabaseClient.js';

const ESTADOS = ['INGRESADO', 'EN PROCESO', 'ESPERA REPUESTOS', 'REVISADO', 'LISTO', 'ENTREGADO'];
const COLOR_ESTADO = {
  INGRESADO: 'bg-slate-100 text-slate-700',
  'EN PROCESO': 'bg-amber-100 text-amber-700',
  'ESPERA REPUESTOS': 'bg-orange-100 text-orange-700',
  REVISADO: 'bg-indigo-100 text-indigo-700',
  LISTO: 'bg-green-100 text-green-700',
  ENTREGADO: 'bg-slate-200 text-slate-500'
};

const WA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 448 512" fill="#25D366"><path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/></svg>`;

function badge(estado) {
  const cls = COLOR_ESTADO[estado] || 'bg-slate-100 text-slate-600';
  return `<span class="rounded-full px-2.5 py-1 text-xs font-bold ${cls}">${estado || 'INGRESADO'}</span>`;
}

function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtFechaInput(iso) {
  if (!iso) return new Date().toISOString().substring(0, 10);
  return new Date(iso).toISOString().substring(0, 10);
}

function fmtMoneda(valor) {
  if (!valor && valor !== 0) return '—';
  return '$' + Number(valor).toLocaleString('es-CO');
}

function waLink(celular, texto) {
  let digits = String(celular || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) digits = '57' + digits;
  return 'https://wa.me/' + digits + (texto ? '?text=' + encodeURIComponent(texto) : '');
}

function waIconCell(celular) {
  const link = waLink(celular);
  if (!link) return `<span class="inline-flex h-7 w-7 items-center justify-center opacity-30">${WA_SVG}</span>`;
  return `<a href="${link}" target="_blank" rel="noopener" title="Escribir por WhatsApp" onclick="event.stopPropagation()" class="inline-flex h-7 w-7 items-center justify-center transition hover:scale-110">${WA_SVG}</a>`;
}

/**
 * Arma el mensaje de actualización para el cliente a partir de los campos
 * que realmente cambiaron. Replica construirMensajeCliente() de
 * legacy/ReparacionesDashboard.html, incluido el texto especial de recogida
 * cuando el nuevo estado es LISTO.
 */
function construirMensajeCliente(ticket, cambios) {
  const esListo = cambios.some((c) => c.campo === 'Estado' && String(c.ahora).toUpperCase().trim() === 'LISTO');

  const lineas = [
    `Hola ${ticket.cliente?.nombre || ''}, le escribimos de VIP TECHNOLOGY con una actualización sobre su equipo "${ticket.equipo || ''}" (Ticket ${ticket.codigo}).`,
    ''
  ];
  cambios.forEach((c) => {
    if (c.campo === 'Estado') lineas.push('• Estado actual: ' + c.ahora);
    else if (c.campo === 'Costo de reparación') lineas.push('• Costo estimado de la reparación: $' + Number(c.ahora).toLocaleString('es-CO'));
    else lineas.push('• ' + c.campo + ': ' + c.ahora);
  });
  lineas.push('');

  if (esListo) {
    lineas.push(
      'Su equipo ya esta disponible para ser recogido, puede pasar por él preferiblemente los dias LUNES - MIERCOLES - VIERNES de 3 de la tarde a 7 de la noche, Agradecemos su retiro dentro de los próximos 15 días hábiles, ya que posterior a esta fecha VIP TECHNOLOGY no podrá responder por la custodia del mismo. ¡Quedamos atentos a tu visita!.'
    );
    lineas.push('');
    lineas.push('Gracias por la confianza');
  } else {
    lineas.push('Quedamos al pendiente de su aprobacion,cualquier duda, con gusto le atendemos. ¡Gracias por su confianza!');
  }
  return lineas.join('\n');
}

export async function render(container, { navigate }) {
  container.innerHTML = `
    <button class="mb-4 text-sm font-semibold text-accent" data-back>← Menú</button>
    <h2 class="mb-4 text-xl font-bold text-slate-900">Reparaciones</h2>

    <div id="rep-metricas" class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4"></div>

    <div class="mb-3 flex flex-col gap-2 sm:flex-row">
      <select id="rep-filtro-estado" class="rounded-md border border-slate-300 px-3 py-2 text-sm">
        <option value="TALLER">🛠️ En taller (no entregado)</option>
        ${ESTADOS.map((e) => `<option value="${e}">${e}</option>`).join('')}
      </select>
      <input id="rep-busqueda" type="text" placeholder="Buscar por cliente, equipo o código…"
             class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
    </div>

    <div id="rep-alert" class="mb-3 hidden rounded-md bg-red-50 p-3 text-sm text-red-700"></div>
    <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table class="w-full min-w-[680px] text-left text-sm">
        <thead class="bg-slate-50 text-xs font-bold uppercase text-slate-500">
          <tr>
            <th class="px-2 py-2 text-center">WA</th>
            <th class="px-3 py-2">Código</th>
            <th class="px-3 py-2">Cliente</th>
            <th class="px-3 py-2">Equipo</th>
            <th class="px-3 py-2">Técnico</th>
            <th class="px-3 py-2">Estado</th>
            <th class="px-3 py-2">Ingreso</th>
          </tr>
        </thead>
        <tbody id="rep-tbody"></tbody>
      </table>
    </div>

    <div id="rep-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-900/70 p-4">
      <div id="rep-modal-card" class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"></div>
    </div>
  `;

  container.querySelector('[data-back]').addEventListener('click', () => navigate('menu'));

  let todos = [];
  let tecnicos = [];
  const alertBox = container.querySelector('#rep-alert');

  function mostrarError(msg) {
    alertBox.textContent = msg;
    alertBox.classList.remove('hidden');
  }

  try {
    [todos, tecnicos] = await Promise.all([listarTickets(), obtenerTecnicos()]);
  } catch (err) {
    console.error(err);
    mostrarError('No se pudieron cargar los tickets: ' + err.message);
    return;
  }

  function metricas() {
    const activos = todos.filter((t) => t.estado !== 'ENTREGADO');
    const cont = (estado) => todos.filter((t) => t.estado === estado).length;
    const el = container.querySelector('#rep-metricas');
    const tarjetas = [
      ['En taller', activos.length],
      ['En proceso', cont('EN PROCESO')],
      ['Revisados', cont('REVISADO')],
      ['Listos', cont('LISTO')]
    ];
    el.innerHTML = tarjetas
      .map(
        ([label, val]) => `
      <div class="rounded-lg border border-slate-200 bg-white p-3 text-center shadow-sm">
        <div class="text-xl font-extrabold text-slate-900">${val}</div>
        <div class="text-xs text-slate-500">${label}</div>
      </div>`
      )
      .join('');
  }

  function filtrados() {
    const estadoFiltro = container.querySelector('#rep-filtro-estado').value;
    const q = container.querySelector('#rep-busqueda').value.toLowerCase().trim();
    return todos.filter((t) => {
      const cumpleEstado = estadoFiltro === 'TALLER' ? t.estado !== 'ENTREGADO' : t.estado === estadoFiltro;
      const texto = `${t.codigo} ${t.cliente?.nombre || ''} ${t.equipo}`.toLowerCase();
      return cumpleEstado && (!q || texto.includes(q));
    });
  }

  function renderTabla() {
    const filas = filtrados();
    const tbody = container.querySelector('#rep-tbody');
    if (!filas.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-3 py-6 text-center text-slate-400">Sin resultados.</td></tr>`;
      return;
    }
    tbody.innerHTML = filas
      .map(
        (t) => `
      <tr class="cursor-pointer border-t border-slate-100 hover:bg-slate-50" data-id="${t.id}">
        <td class="px-2 py-2 text-center">${waIconCell(t.cliente?.celular || t.celular)}</td>
        <td class="px-3 py-2 font-mono text-xs">${t.codigo}</td>
        <td class="px-3 py-2">${t.cliente?.nombre || '—'}</td>
        <td class="px-3 py-2">${t.equipo}</td>
        <td class="px-3 py-2">${t.tecnico?.nombre || '<span class=\"text-slate-400\">Sin asignar</span>'}</td>
        <td class="px-3 py-2">${badge(t.estado)}</td>
        <td class="px-3 py-2 text-xs text-slate-500">${fmtFecha(t.fecha_ingreso)}</td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.addEventListener('click', () => abrirModal(Number(tr.dataset.id)));
    });
  }

  container.querySelector('#rep-filtro-estado').addEventListener('change', renderTabla);
  container.querySelector('#rep-busqueda').addEventListener('input', renderTabla);

  // ---------------------------------------------------------------- modal --
  const modal = container.querySelector('#rep-modal');
  const modalCard = container.querySelector('#rep-modal-card');

  function cerrarModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modalCard.innerHTML = '';
  }

  function renderFichaTecnica(ticket) {
    const bloqueado = ticket.estado === 'ENTREGADO';

    let fotosOriginales = ticket.fotos.map((f) => ({ ...f }));
    let fotosConservar = [...fotosOriginales];
    let fotosNuevas = []; // File[]

    const selTecnico = tecnicos
      .map((tc) => `<option value="${tc.id}" ${tc.id === ticket.tecnico_id ? 'selected' : ''}>${tc.nombre}</option>`)
      .join('');

    modalCard.innerHTML = `
      <div class="mb-3 flex items-start justify-between">
        <div>
          <div class="font-mono text-xs text-slate-400">${ticket.codigo}</div>
          <h3 class="text-lg font-bold text-slate-900">${ticket.cliente?.nombre || 'Cliente'} · ${ticket.equipo}</h3>
        </div>
        <button data-close class="text-slate-400 hover:text-slate-700">✕</button>
      </div>

      ${bloqueado ? '<div class="mb-3 rounded-md bg-slate-100 p-2 text-center text-xs font-semibold text-slate-500">🔒 Ticket ENTREGADO — solo lectura</div>' : ''}

      <div class="mb-4 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
        <div><span class="font-bold text-slate-500">Celular:</span> ${ticket.cliente?.celular || ticket.celular || '—'}</div>
        <div><span class="font-bold text-slate-500">Marca/Tipo:</span> ${ticket.marca?.nombre || '—'} · ${ticket.tipo?.nombre || '—'}</div>
        <div class="sm:col-span-2"><span class="font-bold text-slate-500">Fallas:</span> ${ticket.fallas || 'Sin fallas reportadas.'}</div>
        <div class="sm:col-span-2"><span class="font-bold text-slate-500">Accesorios:</span> ${(ticket.accesorios || []).join(', ') || 'Ninguno'}</div>
      </div>

      <fieldset ${bloqueado ? 'disabled' : ''}>
      <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Técnico asignado</label>
          <select id="md-tecnico" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100">
            <option value="">Sin asignar</option>
            ${selTecnico}
          </select>
        </div>
        <div>
          <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Estado</label>
          <select id="md-estado" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100">
            ${ESTADOS.map((e) => `<option value="${e}" ${e === ticket.estado ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Costo</label>
          <input id="md-costo" type="number" value="${ticket.costo || ''}" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Fecha de reparación</label>
          <input id="md-fecha" type="date" value="${fmtFechaInput(ticket.fecha_reparacion)}" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
        </div>
        <div class="sm:col-span-2">
          <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Comentario técnico 1</label>
          <textarea id="md-com1" rows="2" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100">${ticket.comentario_1 || ''}</textarea>
        </div>
        <div class="sm:col-span-2">
          <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Comentario técnico 2</label>
          <textarea id="md-com2" rows="2" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100">${ticket.comentario_2 || ''}</textarea>
        </div>
        <div class="sm:col-span-2">
          <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Observación final / Informe (visible al cliente)</label>
          <textarea id="md-obsfinal" rows="2" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100">${ticket.observacion_final || ''}</textarea>
        </div>
      </div>

      <div class="mb-4">
        <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Fotos (máx. 5)</label>
        <div id="md-fotos" class="mb-2 flex flex-wrap gap-2"></div>
        ${bloqueado ? '' : '<input id="md-foto-input" type="file" accept="image/*" multiple class="text-sm" />'}
      </div>
      </fieldset>

      <div id="rep-modal-alert" class="mb-3 hidden rounded-md bg-red-50 p-3 text-sm text-red-700"></div>

      ${
        bloqueado
          ? ''
          : `<button id="md-guardar" class="w-full rounded-md bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-dark">Guardar cambios</button>`
      }
    `;

    modalCard.querySelector('[data-close]').addEventListener('click', cerrarModal);

    function renderFotos() {
      const wrap = modalCard.querySelector('#md-fotos');
      const existentes = fotosConservar
        .map(
          (f) => `
        <div class="relative h-20 w-20">
          <img src="${f.url}" class="h-20 w-20 rounded-md border border-slate-200 object-cover" />
          ${bloqueado ? '' : `<button data-quitar-existente="${f.id}" class="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-red-600 text-xs text-white">✕</button>`}
        </div>`
        )
        .join('');
      const nuevas = fotosNuevas
        .map(
          (_, i) => `
        <div class="relative h-20 w-20">
          <img src="${URL.createObjectURL(fotosNuevas[i])}" class="h-20 w-20 rounded-md border border-accent object-cover" />
          <button data-quitar-nueva="${i}" class="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-red-600 text-xs text-white">✕</button>
        </div>`
        )
        .join('');
      wrap.innerHTML = existentes + nuevas || '<span class="text-xs text-slate-400">Sin fotos aún.</span>';

      wrap.querySelectorAll('[data-quitar-existente]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = Number(btn.dataset.quitarExistente);
          fotosConservar = fotosConservar.filter((f) => f.id !== id);
          renderFotos();
        });
      });
      wrap.querySelectorAll('[data-quitar-nueva]').forEach((btn) => {
        btn.addEventListener('click', () => {
          fotosNuevas.splice(Number(btn.dataset.quitarNueva), 1);
          renderFotos();
        });
      });
    }
    renderFotos();

    const fotoInput = modalCard.querySelector('#md-foto-input');
    if (fotoInput) {
      fotoInput.addEventListener('change', (evt) => {
        const total = fotosConservar.length + fotosNuevas.length;
        const disponibles = 5 - total;
        const nuevos = Array.from(evt.target.files).slice(0, Math.max(disponibles, 0));
        fotosNuevas = fotosNuevas.concat(nuevos);
        evt.target.value = '';
        renderFotos();
      });
    }

    const btnGuardar = modalCard.querySelector('#md-guardar');
    if (btnGuardar) {
      btnGuardar.addEventListener('click', async () => {
        const modalAlert = modalCard.querySelector('#rep-modal-alert');
        modalAlert.classList.add('hidden');
        btnGuardar.disabled = true;
        btnGuardar.textContent = 'Guardando…';

        const tecnicoIdNuevo = modalCard.querySelector('#md-tecnico').value || null;
        const nuevos = {
          estado: modalCard.querySelector('#md-estado').value,
          tecnico_id: tecnicoIdNuevo,
          costo: modalCard.querySelector('#md-costo').value ? Number(modalCard.querySelector('#md-costo').value) : null,
          fecha_reparacion: modalCard.querySelector('#md-fecha').value || null,
          comentario_1: modalCard.querySelector('#md-com1').value.trim() || null,
          comentario_2: modalCard.querySelector('#md-com2').value.trim() || null,
          observacion_final: modalCard.querySelector('#md-obsfinal').value.trim() || null
        };

        // ── Detectar cambios (para el mensaje al cliente), igual que legacy ──
        const etiquetas = {
          estado: 'Estado',
          tecnico_id: 'Técnico asignado',
          costo: 'Costo de reparación',
          observacion_final: 'Observación final / Informe',
          comentario_1: 'Comentario 1',
          comentario_2: 'Comentario 2'
        };
        const valorMostrable = (campo, valor) => {
          if (campo === 'tecnico_id') return tecnicos.find((tc) => tc.id === valor)?.nombre || '';
          return valor;
        };
        const cambios = [];
        Object.keys(etiquetas).forEach((campo) => {
          const antes = String(valorMostrable(campo, ticket[campo]) || '').trim();
          const ahora = String(valorMostrable(campo, nuevos[campo]) || '').trim();
          if (antes !== ahora && ahora !== '') {
            cambios.push({ campo: etiquetas[campo], antes, ahora });
          }
        });

        try {
          await guardarFichaReparacion({
            ticketId: ticket.id,
            codigo: ticket.codigo,
            cambios: nuevos,
            fotosOriginales,
            fotosAConservar: fotosConservar,
            fotosNuevas
          });
          Object.assign(ticket, nuevos);
          todos = await listarTickets();
          metricas();
          renderTabla();

          if (cambios.length > 0) {
            renderModalEnvio(ticket, cambios);
          } else {
            cerrarModal();
          }
        } catch (err) {
          console.error(err);
          modalAlert.textContent = err.message;
          modalAlert.classList.remove('hidden');
          btnGuardar.disabled = false;
          btnGuardar.textContent = 'Guardar cambios';
        }
      });
    }
  }

  // ── Modal de notificación al cliente: se abre solo, igual que en legacy ──
  function renderModalEnvio(ticket, cambios) {
    const resumenHtml = cambios
      .map(
        (c) => `
      <div class="flex justify-between border-b border-slate-100 py-1 text-sm last:border-0">
        <span class="font-semibold text-slate-500">${c.campo}</span>
        <span>${c.campo === 'Costo de reparación' ? fmtMoneda(c.ahora) : c.ahora}</span>
      </div>`
      )
      .join('');

    const correo = ticket.cliente?.correo || ticket.correo_cliente;
    const celular = ticket.cliente?.celular || ticket.celular;

    modalCard.innerHTML = `
      <div class="mb-3 flex items-start justify-between">
        <div>
          <div class="font-mono text-xs text-slate-400">${ticket.codigo}</div>
          <h3 class="text-lg font-bold text-slate-900">📨 Notificar al cliente</h3>
          <p class="text-xs text-slate-500">${ticket.cliente?.nombre || 'Cliente sin nombre'} · ${ticket.equipo || ''}</p>
        </div>
        <button data-close class="text-slate-400 hover:text-slate-700">✕</button>
      </div>

      <div class="mb-3 rounded-lg bg-slate-50 p-3">
        <div class="mb-1 text-xs font-bold uppercase text-slate-500">✅ Cambios guardados en esta actualización</div>
        ${resumenHtml}
      </div>

      <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Mensaje para el cliente (editable)</label>
      <textarea id="env-mensaje" rows="7" class="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">${construirMensajeCliente(ticket, cambios)}</textarea>

      <p id="env-estado" class="mb-2 text-xs text-slate-500"></p>

      <div class="flex flex-col gap-2 sm:flex-row">
        <button id="env-omitir" class="flex-1 rounded-md border border-slate-300 py-2.5 text-sm font-bold text-slate-600">Omitir, no enviar</button>
        <button id="env-correo" class="flex-1 rounded-md bg-slate-700 py-2.5 text-sm font-bold text-white disabled:opacity-40" ${correo ? '' : 'disabled title="Este cliente no tiene correo registrado"'}>✉️ Enviar por correo</button>
        <button id="env-wa" class="flex-1 rounded-md bg-[#25D366] py-2.5 text-sm font-bold text-white disabled:opacity-40" ${celular ? '' : 'disabled title="Este cliente no tiene celular registrado"'}>🟢 Enviar por WhatsApp</button>
      </div>
    `;

    modalCard.querySelector('[data-close]').addEventListener('click', cerrarModal);
    modalCard.querySelector('#env-omitir').addEventListener('click', cerrarModal);

    modalCard.querySelector('#env-wa').addEventListener('click', () => {
      const texto = modalCard.querySelector('#env-mensaje').value;
      const link = waLink(celular, texto);
      if (!link) return;
      window.open(link, '_blank', 'noopener');
    });

    modalCard.querySelector('#env-correo').addEventListener('click', async () => {
      const btn = modalCard.querySelector('#env-correo');
      const estadoEl = modalCard.querySelector('#env-estado');
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      try {
        const { error } = await supabase.functions.invoke('send-reparacion-email', {
          body: {
            destinatario: correo,
            asunto: 'Actualización de su reparación · Ticket ' + ticket.codigo,
            cuerpo: modalCard.querySelector('#env-mensaje').value
          }
        });
        if (error) throw error;
        estadoEl.textContent = '✅ Correo enviado a ' + correo;
      } catch (err) {
        console.error(err);
        estadoEl.textContent = '❌ No se pudo enviar el correo.';
      } finally {
        btn.disabled = false;
        btn.textContent = '✉️ Enviar por correo';
      }
    });
  }

  function abrirModal(id) {
    const ticket = todos.find((t) => t.id === id);
    if (!ticket) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    renderFichaTecnica(ticket);
  }

  metricas();
  renderTabla();
}
