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
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(texto);
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
      <table class="w-full min-w-[640px] text-left text-sm">
        <thead class="bg-slate-50 text-xs font-bold uppercase text-slate-500">
          <tr>
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
      tbody.innerHTML = `<tr><td colspan="6" class="px-3 py-6 text-center text-slate-400">Sin resultados.</td></tr>`;
      return;
    }
    tbody.innerHTML = filas
      .map(
        (t) => `
      <tr class="cursor-pointer border-t border-slate-100 hover:bg-slate-50" data-id="${t.id}">
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

  function abrirModal(id) {
    const ticket = todos.find((t) => t.id === id);
    if (!ticket) return;

    let fotosOriginales = ticket.fotos.map((f) => ({ ...f }));
    let fotosConservar = [...fotosOriginales];
    let fotosNuevas = []; // File[]

    const selTecnico = tecnicos
      .map((t) => `<option value="${t.id}" ${t.id === ticket.tecnico_id ? 'selected' : ''}>${t.nombre}</option>`)
      .join('');

    modalCard.innerHTML = `
      <div class="mb-3 flex items-start justify-between">
        <div>
          <div class="font-mono text-xs text-slate-400">${ticket.codigo}</div>
          <h3 class="text-lg font-bold text-slate-900">${ticket.cliente?.nombre || 'Cliente'} · ${ticket.equipo}</h3>
        </div>
        <button data-close class="text-slate-400 hover:text-slate-700">✕</button>
      </div>

      <div class="mb-4 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
        <div><span class="font-bold text-slate-500">Celular:</span> ${ticket.cliente?.celular || ticket.celular || '—'}</div>
        <div><span class="font-bold text-slate-500">Marca/Tipo:</span> ${ticket.marca?.nombre || '—'} · ${ticket.tipo?.nombre || '—'}</div>
        <div class="sm:col-span-2"><span class="font-bold text-slate-500">Fallas:</span> ${ticket.fallas || 'Sin fallas reportadas.'}</div>
        <div class="sm:col-span-2"><span class="font-bold text-slate-500">Accesorios:</span> ${(ticket.accesorios || []).join(', ') || 'Ninguno'}</div>
      </div>

      <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Técnico asignado</label>
          <select id="md-tecnico" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Sin asignar</option>
            ${selTecnico}
          </select>
        </div>
        <div>
          <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Estado</label>
          <select id="md-estado" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            ${ESTADOS.map((e) => `<option value="${e}" ${e === ticket.estado ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Costo</label>
          <input id="md-costo" type="number" value="${ticket.costo || ''}" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Fecha de reparación</label>
          <input id="md-fecha" type="date" value="${fmtFechaInput(ticket.fecha_reparacion)}" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div class="sm:col-span-2">
          <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Comentario técnico 1</label>
          <textarea id="md-com1" rows="2" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">${ticket.comentario_1 || ''}</textarea>
        </div>
        <div class="sm:col-span-2">
          <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Comentario técnico 2</label>
          <textarea id="md-com2" rows="2" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">${ticket.comentario_2 || ''}</textarea>
        </div>
        <div class="sm:col-span-2">
          <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Observación final (visible al cliente)</label>
          <textarea id="md-obsfinal" rows="2" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">${ticket.observacion_final || ''}</textarea>
        </div>
      </div>

      <div class="mb-4">
        <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Fotos (máx. 5)</label>
        <div id="md-fotos" class="mb-2 flex flex-wrap gap-2"></div>
        <input id="md-foto-input" type="file" accept="image/*" multiple class="text-sm" />
      </div>

      <div id="rep-modal-alert" class="mb-3 hidden rounded-md bg-red-50 p-3 text-sm text-red-700"></div>

      <div class="flex flex-col gap-2 sm:flex-row">
        <button id="md-guardar" class="flex-1 rounded-md bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-dark">Guardar cambios</button>
        <button id="md-mensaje" class="flex-1 rounded-md border border-accent py-2.5 text-sm font-bold text-accent hover:bg-accent-soft">Enviar actualización al cliente</button>
      </div>

      <div id="rep-mensaje-panel" class="mt-4 hidden rounded-lg border border-slate-200 bg-slate-50 p-4">
        <label class="mb-1 block text-xs font-bold uppercase text-slate-500">Mensaje (editable)</label>
        <textarea id="rep-mensaje-texto" rows="6" class="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"></textarea>
        <div class="flex flex-col gap-2 sm:flex-row">
          <button id="rep-enviar-wa" class="flex-1 rounded-md bg-[#25D366] py-2 text-sm font-bold text-white">📲 WhatsApp</button>
          <button id="rep-enviar-correo" class="flex-1 rounded-md bg-slate-700 py-2 text-sm font-bold text-white">✉️ Correo</button>
        </div>
        <p id="rep-envio-estado" class="mt-2 text-xs text-slate-500"></p>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modalCard.querySelector('[data-close]').addEventListener('click', cerrarModal);

    function renderFotos() {
      const wrap = modalCard.querySelector('#md-fotos');
      const existentes = fotosConservar
        .map(
          (f) => `
        <div class="relative h-20 w-20">
          <img src="${f.url}" class="h-20 w-20 rounded-md border border-slate-200 object-cover" />
          <button data-quitar-existente="${f.id}" class="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-red-600 text-xs text-white">✕</button>
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

    modalCard.querySelector('#md-foto-input').addEventListener('change', (evt) => {
      const total = fotosConservar.length + fotosNuevas.length;
      const disponibles = 5 - total;
      const nuevos = Array.from(evt.target.files).slice(0, Math.max(disponibles, 0));
      fotosNuevas = fotosNuevas.concat(nuevos);
      evt.target.value = '';
      renderFotos();
    });

    // ---------- Guardar ----------
    modalCard.querySelector('#md-guardar').addEventListener('click', async () => {
      const btn = modalCard.querySelector('#md-guardar');
      const modalAlert = modalCard.querySelector('#rep-modal-alert');
      modalAlert.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Guardando…';

      const cambios = {
        tecnico_id: modalCard.querySelector('#md-tecnico').value || null,
        estado: modalCard.querySelector('#md-estado').value,
        costo: modalCard.querySelector('#md-costo').value ? Number(modalCard.querySelector('#md-costo').value) : null,
        fecha_reparacion: modalCard.querySelector('#md-fecha').value || null,
        comentario_1: modalCard.querySelector('#md-com1').value.trim() || null,
        comentario_2: modalCard.querySelector('#md-com2').value.trim() || null,
        observacion_final: modalCard.querySelector('#md-obsfinal').value.trim() || null
      };

      try {
        await guardarFichaReparacion({
          ticketId: ticket.id,
          codigo: ticket.codigo,
          cambios,
          fotosOriginales,
          fotosAConservar: fotosConservar,
          fotosNuevas
        });
        Object.assign(ticket, cambios);
        todos = await listarTickets();
        metricas();
        renderTabla();
        cerrarModal();
      } catch (err) {
        console.error(err);
        modalAlert.textContent = err.message;
        modalAlert.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar cambios';
      }
    });

    // ---------- Enviar mensaje al cliente ----------
    modalCard.querySelector('#md-mensaje').addEventListener('click', () => {
      const panel = modalCard.querySelector('#rep-mensaje-panel');
      panel.classList.toggle('hidden');
      if (panel.classList.contains('hidden')) return;

      const estado = modalCard.querySelector('#md-estado').value;
      const costo = modalCard.querySelector('#md-costo').value;
      const obsFinal = modalCard.querySelector('#md-obsfinal').value.trim();

      let mensaje =
        `Hola ${ticket.cliente?.nombre || 'cliente'} 👋\n` +
        `Te escribimos de VIP TECHNOLOGY sobre tu equipo *${ticket.equipo}* (código ${ticket.codigo}).\n\n` +
        `Estado actual: *${estado}*\n`;
      if (estado === 'LISTO' && costo) mensaje += `Costo total: ${fmtMoneda(costo)}\n`;
      if (obsFinal) mensaje += `\n${obsFinal}\n`;
      mensaje += `\n¡Gracias por confiar en nosotros!`;

      modalCard.querySelector('#rep-mensaje-texto').value = mensaje;
    });

    modalCard.querySelector('#rep-enviar-wa').addEventListener('click', () => {
      const texto = modalCard.querySelector('#rep-mensaje-texto').value.trim();
      const celular = ticket.cliente?.celular || ticket.celular;
      const link = waLink(celular, texto);
      if (!link) return alert('No hay un celular válido para este cliente.');
      window.open(link, '_blank');
    });

    modalCard.querySelector('#rep-enviar-correo').addEventListener('click', async () => {
      const correo = ticket.cliente?.correo || ticket.correo_cliente;
      const estadoEl = modalCard.querySelector('#rep-envio-estado');
      if (!correo) {
        estadoEl.textContent = 'Este cliente no tiene correo registrado.';
        return;
      }
      estadoEl.textContent = 'Enviando…';
      try {
        const { error } = await supabase.functions.invoke('send-reparacion-email', {
          body: {
            destinatario: correo,
            asunto: 'Actualización de su reparación — VIP TECHNOLOGY',
            cuerpo: modalCard.querySelector('#rep-mensaje-texto').value.trim()
          }
        });
        if (error) throw error;
        estadoEl.textContent = '✅ Correo enviado.';
      } catch (err) {
        console.error(err);
        estadoEl.textContent = '❌ No se pudo enviar el correo.';
      }
    });
  }

  metricas();
  renderTabla();
}
