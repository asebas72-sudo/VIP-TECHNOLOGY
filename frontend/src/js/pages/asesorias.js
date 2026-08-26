import { listarAsesorias, guardarAsesoria, marcarAsesoriaRealizada } from '../data/asesorias.js';
import { obtenerTecnicos } from '../data/catalogos.js';
import { waLink, waIconCell } from '../../lib/whatsapp.js';

const COLOR_ESTADO = {
  PENDIENTE: 'bg-sky-100 text-sky-700',
  CONFIRMADA: 'bg-amber-100 text-amber-700',
  REALIZADA: 'bg-green-100 text-green-700',
  CANCELADA: 'bg-red-100 text-red-700'
};

function badge(estado) {
  const cls = COLOR_ESTADO[estado] || 'bg-slate-100 text-slate-600';
  return `<span class="rounded px-2 py-0.5 text-[11px] font-bold uppercase ${cls}">${estado || 'PENDIENTE'}</span>`;
}

function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    fmtFecha(iso) +
    ' ' +
    String(d.getHours()).padStart(2, '0') +
    ':' +
    String(d.getMinutes()).padStart(2, '0')
  );
}

function fmtCosto(v) {
  if (!v && v !== 0) return '—';
  return '$ ' + Number(v).toLocaleString('es-CO');
}

function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Prioridad de orden: PENDIENTE primero, luego CONFIRMADA, REALIZADA/CANCELADA al final — igual que legacy.
function prioridadEstado(estado) {
  if (estado === 'PENDIENTE') return 0;
  if (estado === 'CONFIRMADA') return 1;
  return 2;
}

const ESTADOS = ['PENDIENTE', 'CONFIRMADA', 'REALIZADA', 'CANCELADA'];

export async function render(container, { navigate }) {
  container.innerHTML = `
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <button class="mb-1 block text-sm font-semibold text-accent" data-back>← Menú</button>
        <h2 class="text-xl font-bold text-slate-900">Control de Asesorías</h2>
      </div>
      <button id="btn-nueva" class="rounded-md bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-dark">+ Nueva asesoría</button>
    </div>

    <div id="ase-metricas" class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5"></div>

    <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <input id="ase-busqueda" type="text" placeholder="Buscar por cliente, ID, solicitud…"
             class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm sm:min-w-[220px]" />
      <select id="ase-filtro-estado" class="rounded-md border border-slate-300 px-3 py-2 text-sm">
        <option value="TODOS">📋 Todos los estados</option>
        ${ESTADOS.map((e) => `<option value="${e}">${e}</option>`).join('')}
      </select>
      <div class="flex items-center gap-2 text-xs text-slate-500">
        <span>Desde</span>
        <input id="ase-desde" type="date" class="rounded-md border border-slate-300 px-2 py-2 text-sm" />
        <span>Hasta</span>
        <input id="ase-hasta" type="date" class="rounded-md border border-slate-300 px-2 py-2 text-sm" />
      </div>
    </div>

    <div id="ase-alert" class="mb-3 hidden rounded-md bg-red-50 p-3 text-sm text-red-700"></div>

    <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table class="tabla-responsive w-full min-w-[900px] text-left text-sm">
        <thead class="bg-slate-50 text-xs font-bold uppercase text-slate-500">
          <tr>
            <th class="px-2 py-2 text-center">WA</th>
            <th class="px-3 py-2">Fecha</th>
            <th class="px-3 py-2">ID</th>
            <th class="px-3 py-2">Cliente</th>
            <th class="px-3 py-2">Celular</th>
            <th class="px-3 py-2">Solicitud</th>
            <th class="px-3 py-2">Técnico</th>
            <th class="px-3 py-2">F. Visita</th>
            <th class="px-3 py-2">Detalle</th>
            <th class="px-3 py-2">Costo</th>
            <th class="px-3 py-2">Estado</th>
          </tr>
        </thead>
        <tbody id="ase-tbody"></tbody>
      </table>
      <div class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <span id="ase-pag-info"></span>
        <div class="flex gap-2">
          <button id="ase-prev" class="rounded border border-slate-300 px-2 py-1">← Ant</button>
          <button id="ase-next" class="rounded border border-slate-300 px-2 py-1">Sig →</button>
        </div>
      </div>
    </div>

    <div id="ase-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-900/70 p-4">
      <div id="ase-modal-card" class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"></div>
    </div>
  `;

  container.querySelector('[data-back]').addEventListener('click', () => navigate('menu'));
  container.querySelector('#btn-nueva').addEventListener('click', () => navigate('asesoriaForm'));

  let todos = [];
  let tecnicos = [];
  let pagina = 1;
  const porPagina = 12;
  const alertBox = container.querySelector('#ase-alert');

  try {
    [todos, tecnicos] = await Promise.all([listarAsesorias(), obtenerTecnicos()]);
  } catch (err) {
    console.error(err);
    alertBox.textContent = 'No se pudieron cargar las asesorías: ' + err.message;
    alertBox.classList.remove('hidden');
    return;
  }

  function metricas() {
    const cont = (estado) => todos.filter((a) => a.estado === estado).length;
    const tarjetas = [
      ['Total', todos.length, 'border-slate-400'],
      ['Pendientes', cont('PENDIENTE'), 'border-sky-400'],
      ['Confirmadas', cont('CONFIRMADA'), 'border-amber-400'],
      ['Realizadas', cont('REALIZADA'), 'border-green-400'],
      ['Canceladas', cont('CANCELADA'), 'border-red-400']
    ];
    container.querySelector('#ase-metricas').innerHTML = tarjetas
      .map(
        ([label, val, borde]) => `
      <div class="rounded-lg border-l-4 ${borde} border-y border-r border-slate-200 bg-white p-3 shadow-sm">
        <div class="text-xl font-extrabold text-slate-900">${val}</div>
        <div class="text-xs uppercase text-slate-500">${label}</div>
      </div>`
      )
      .join('');
  }

  function filtrarOrdenar() {
    const q = container.querySelector('#ase-busqueda').value.toLowerCase().trim();
    const estadoFiltro = container.querySelector('#ase-filtro-estado').value;
    const desde = container.querySelector('#ase-desde').value;
    const hasta = container.querySelector('#ase-hasta').value;

    let filas = todos.filter((a) => {
      const texto = `${a.id} ${a.cliente?.nombre || ''} ${a.solicitud}`.toLowerCase();
      const cumpleBusqueda = !q || texto.includes(q);
      const cumpleEstado = estadoFiltro === 'TODOS' || a.estado === estadoFiltro;

      let cumpleFecha = true;
      if (desde || hasta) {
        const f = a.fecha_ingreso ? new Date(a.fecha_ingreso) : null;
        if (!f) cumpleFecha = false;
        else {
          if (desde && f < new Date(desde + 'T00:00:00')) cumpleFecha = false;
          if (hasta && f > new Date(hasta + 'T23:59:59')) cumpleFecha = false;
        }
      }
      return cumpleBusqueda && cumpleEstado && cumpleFecha;
    });

    filas.sort((a, b) => {
      const pa = prioridadEstado(a.estado);
      const pb = prioridadEstado(b.estado);
      if (pa !== pb) return pa - pb;
      return String(b.fecha_ingreso || '').localeCompare(String(a.fecha_ingreso || ''));
    });

    return filas;
  }

  function renderTabla() {
    const filas = filtrarOrdenar();
    const total = filas.length;
    const inicio = (pagina - 1) * porPagina;
    const fin = Math.min(inicio + porPagina, total);
    const slice = filas.slice(inicio, fin);

    container.querySelector('#ase-pag-info').textContent =
      total === 0 ? 'Sin registros' : `Registros ${inicio + 1} al ${fin} de ${total}`;
    container.querySelector('#ase-prev').disabled = pagina <= 1;
    container.querySelector('#ase-next').disabled = fin >= total;

    const tbody = container.querySelector('#ase-tbody');
    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="11" class="px-3 py-8 text-center text-slate-400">Ninguna asesoría bajo este criterio.</td></tr>`;
      return;
    }

    tbody.innerHTML = slice
      .map((a) => {
        const detalle = a.fallas || '—';
        const detalleTrunc = detalle.length > 36 ? detalle.slice(0, 36) + '…' : detalle;
        const tecnico = tecnicos.find((t) => t.id === a.tecnico_id);
        return `
      <tr class="cursor-pointer border-t border-slate-100 hover:bg-slate-50" data-id="${a.id}">
        <td class="wa-cell px-2 py-2 text-center">${waIconCell(a.cliente?.celular || a.celular)}</td>
        <td data-label="Fecha" class="px-3 py-2 text-xs text-slate-500">${fmtFecha(a.fecha_ingreso)}</td>
        <td data-label="ID" class="px-3 py-2 font-mono text-xs">#${a.id}</td>
        <td data-label="Cliente" class="px-3 py-2 font-semibold">${a.cliente?.nombre || '—'}</td>
        <td data-label="Celular" class="px-3 py-2">${a.cliente?.celular || a.celular || '—'}</td>
        <td data-label="Solicitud" class="px-3 py-2">${a.solicitud || '—'}</td>
        <td data-label="Técnico" class="px-3 py-2">${tecnico?.nombre || '<span class="italic text-slate-400">Sin asignar</span>'}</td>
        <td data-label="F. Visita" class="px-3 py-2 text-xs">${fmtFechaHora(a.fecha_visita)}</td>
        <td data-label="Detalle" class="max-w-[160px] truncate px-3 py-2 text-xs">${detalleTrunc}</td>
        <td data-label="Costo" class="px-3 py-2 font-mono text-xs font-semibold text-green-700">${fmtCosto(a.costo)}</td>
        <td data-label="Estado" class="px-3 py-2">${badge(a.estado)}</td>
      </tr>`;
      })
      .join('');

    tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.addEventListener('click', () => abrirModal(Number(tr.dataset.id)));
    });
  }

  container.querySelector('#ase-busqueda').addEventListener('input', () => {
    pagina = 1;
    renderTabla();
  });
  container.querySelector('#ase-filtro-estado').addEventListener('change', () => {
    pagina = 1;
    renderTabla();
  });
  container.querySelector('#ase-desde').addEventListener('change', renderTabla);
  container.querySelector('#ase-hasta').addEventListener('change', renderTabla);
  container.querySelector('#ase-prev').addEventListener('click', () => {
    pagina -= 1;
    renderTabla();
  });
  container.querySelector('#ase-next').addEventListener('click', () => {
    pagina += 1;
    renderTabla();
  });

  // ---------------------------------------------------------------- modal --
  const modal = container.querySelector('#ase-modal');
  const modalCard = container.querySelector('#ase-modal-card');

  function cerrarModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modalCard.innerHTML = '';
  }

  function abrirModal(id) {
    const a = todos.find((x) => x.id === id);
    if (!a) return;
    const bloqueado = a.estado === 'REALIZADA';

    const selTecnico = tecnicos
      .map((t) => `<option value="${t.id}" ${t.id === a.tecnico_id ? 'selected' : ''}>${t.nombre}</option>`)
      .join('');

    modalCard.innerHTML = `
      <div class="mb-3 flex items-start justify-between">
        <span class="font-mono text-xs text-slate-400">Asesoría #${a.id}</span>
        <button data-close class="text-slate-400 hover:text-slate-700">✕</button>
      </div>

      ${bloqueado ? '<div class="mb-3 rounded-md bg-slate-100 p-2 text-center text-xs font-semibold text-slate-500">🔒 Esta asesoría ya fue REALIZADA — no admite más ediciones.</div>' : ''}

      <div class="mb-3 grid grid-cols-2 gap-3 text-sm">
        <div><span class="block text-[10px] font-bold uppercase text-slate-400">Fecha solicitud</span>${fmtFecha(a.fecha_ingreso)}</div>
        <div>
          <label class="block text-[10px] font-bold uppercase text-slate-400">📅 Fecha y hora visita</label>
          <input id="md-fecha-visita" type="datetime-local" value="${isoToDatetimeLocal(a.fecha_visita)}" class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100" ${bloqueado ? 'disabled' : ''} />
        </div>
        <div class="col-span-2"><span class="block text-[10px] font-bold uppercase text-slate-400">Cliente</span><b>${a.cliente?.nombre || '—'}</b></div>
        <div><span class="block text-[10px] font-bold uppercase text-slate-400">Celular</span>${a.cliente?.celular || a.celular || '—'}</div>
        <div><span class="block text-[10px] font-bold uppercase text-slate-400">Solicitud</span>${a.solicitud || '—'}</div>

        <div class="col-span-2">
          <label class="mb-1 block text-[10px] font-bold uppercase text-slate-400">🧑‍🔧 Técnico asignado</label>
          <div class="flex items-center gap-2">
            <select id="md-tecnico" class="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100" ${bloqueado ? 'disabled' : ''}>
              <option value="">Sin asignar</option>
              ${selTecnico}
            </select>
            <button type="button" id="btn-wa-tecnico" title="Avisar al técnico por WhatsApp" class="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-full hover:bg-slate-100">${'💬'}</button>
          </div>
        </div>

        <div class="col-span-2"><span class="block text-[10px] font-bold uppercase text-slate-400">Detalle de la solicitud</span>${a.fallas || 'Sin detalle registrado.'}</div>
        <div class="col-span-2"><span class="block text-[10px] font-bold uppercase text-slate-400">Observaciones</span>${a.observaciones || 'Sin observaciones.'}</div>

        <div>
          <label class="block text-[10px] font-bold uppercase text-slate-400">💰 Costo</label>
          <input id="md-costo" type="number" value="${a.costo || ''}" class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100" ${bloqueado ? 'disabled' : ''} />
        </div>
        <div>
          <label class="block text-[10px] font-bold uppercase text-slate-400">Estado</label>
          <select id="md-estado" class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100" ${bloqueado ? 'disabled' : ''}>
            ${ESTADOS.map((e) => `<option value="${e}" ${e === a.estado ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
        </div>

        <div class="col-span-2">
          <label class="block text-[10px] font-bold uppercase text-slate-400">📝 Observación final</label>
          <textarea id="md-obsfinal" rows="2" class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100" ${bloqueado ? 'disabled' : ''}>${a.observacion_final || ''}</textarea>
        </div>
      </div>

      <div id="ase-modal-alert" class="mb-3 hidden rounded-md bg-red-50 p-3 text-sm text-red-700"></div>

      <div class="flex flex-col gap-2 border-t border-slate-200 pt-3">
        ${bloqueado ? '' : '<button id="btn-guardar" class="rounded-md bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-dark">💾 Guardar cambios</button>'}
        <button id="btn-realizada" class="rounded-md bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500" ${bloqueado ? 'disabled' : ''}>
          ${bloqueado ? '✅ Ya fue marcada como REALIZADA' : '✅ Marcar como REALIZADA'}
        </button>
        <button id="btn-wa-cliente" class="rounded-md bg-[#25D366] py-2.5 text-sm font-bold text-white hover:opacity-90">💬 Notificar por WhatsApp</button>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modalCard.querySelector('[data-close]').addEventListener('click', cerrarModal);

    // ── Ícono para avisar al técnico asignado ──
    const selTecnicoEl = modalCard.querySelector('#md-tecnico');
    const btnWaTecnico = modalCard.querySelector('#btn-wa-tecnico');
    function actualizarBotonWaTecnico() {
      const tec = tecnicos.find((t) => String(t.id) === selTecnicoEl.value);
      if (tec && tec.celular) {
        btnWaTecnico.classList.remove('hidden');
        btnWaTecnico.classList.add('flex');
      } else {
        btnWaTecnico.classList.add('hidden');
        btnWaTecnico.classList.remove('flex');
      }
    }
    actualizarBotonWaTecnico();
    selTecnicoEl.addEventListener('change', actualizarBotonWaTecnico);

    btnWaTecnico.addEventListener('click', () => {
      const tec = tecnicos.find((t) => String(t.id) === selTecnicoEl.value);
      if (!tec || !tec.celular) return;
      const fechaVisitaVal = modalCard.querySelector('#md-fecha-visita').value;
      const fechaVisitaTxt = fechaVisitaVal ? fmtFechaHora(new Date(fechaVisitaVal).toISOString()) : 'Por definir';
      const msj =
        `Hola ${tec.nombre}, te informamos de VIP TECHNOLOGY que se te ha asignado la asesoría #${a.id} ` +
        `del cliente ${a.cliente?.nombre || ''}${a.cliente?.celular ? ' (Cel: ' + a.cliente.celular + ')' : ''}. ` +
        `Solicitud: ${a.solicitud || 'Sin especificar'}. Fecha y hora de visita: ${fechaVisitaTxt}. ` +
        `Detalle: ${a.fallas || 'Sin detalle registrado'}.`;
      const link = waLink(tec.celular, msj);
      if (link) window.open(link, '_blank');
    });

    // ── Guardar cambios ──
    const btnGuardar = modalCard.querySelector('#btn-guardar');
    if (btnGuardar) {
      btnGuardar.addEventListener('click', async () => {
        const modalAlert = modalCard.querySelector('#ase-modal-alert');
        modalAlert.classList.add('hidden');
        btnGuardar.disabled = true;
        btnGuardar.textContent = 'Guardando…';

        const fechaVisitaVal = modalCard.querySelector('#md-fecha-visita').value;
        const cambios = {
          tecnico_id: selTecnicoEl.value || null,
          estado: modalCard.querySelector('#md-estado').value,
          costo: modalCard.querySelector('#md-costo').value ? Number(modalCard.querySelector('#md-costo').value) : null,
          observacion_final: modalCard.querySelector('#md-obsfinal').value.trim() || null,
          fecha_visita: fechaVisitaVal ? new Date(fechaVisitaVal).toISOString() : null
        };

        try {
          await guardarAsesoria(a.id, cambios);
          Object.assign(a, cambios);
          todos = await listarAsesorias();
          metricas();
          renderTabla();
          cerrarModal();
        } catch (err) {
          console.error(err);
          modalAlert.textContent = err.message;
          modalAlert.classList.remove('hidden');
          btnGuardar.disabled = false;
          btnGuardar.textContent = '💾 Guardar cambios';
        }
      });
    }

    // ── Marcar como REALIZADA ──
    modalCard.querySelector('#btn-realizada').addEventListener('click', async () => {
      const btn = modalCard.querySelector('#btn-realizada');
      btn.disabled = true;
      btn.textContent = '⏳ Guardando…';
      try {
        await marcarAsesoriaRealizada(a.id);
        a.estado = 'REALIZADA';
        todos = await listarAsesorias();
        metricas();
        renderTabla();
        abrirModal(a.id); // re-renderiza el modal ya bloqueado
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.textContent = '✅ Marcar como REALIZADA';
        alert('No se pudo guardar: ' + err.message);
      }
    });

    // ── Notificar al cliente por WhatsApp ──
    modalCard.querySelector('#btn-wa-cliente').addEventListener('click', () => {
      const celular = a.cliente?.celular || a.celular;
      let msj;
      if (a.estado === 'REALIZADA') {
        const ahora = new Date();
        const fechaHora =
          String(ahora.getDate()).padStart(2, '0') +
          '/' +
          String(ahora.getMonth() + 1).padStart(2, '0') +
          '/' +
          ahora.getFullYear() +
          ', ' +
          String(ahora.getHours()).padStart(2, '0') +
          ':' +
          String(ahora.getMinutes()).padStart(2, '0');
        msj =
          `Hola ${a.cliente?.nombre || 'Cliente'} ,Le escribimos de VIP TECHONOLOGY, tu asesoría "${a.solicitud || ''}" ` +
          `cambió a estado REALIZADA. Se cierra asesoría el ${fechaHora}. Observación final: ${a.observacion_final || 'Sin observaciones adicionales.'} ` +
          `¡Gracias por confiar en nosotros!`;
      } else {
        const tec = tecnicos.find((t) => t.id === a.tecnico_id);
        msj =
          `Hola ${a.cliente?.nombre || 'Cliente'} ,Le escribimos de VIP TECHONOLOGY, te confirmamos información sobre tu asesoría "${a.solicitud || ''}". ` +
          `Estado actual: ${a.estado || ''}. Técnico asignado: ${tec?.nombre || 'Por asignar'}. ` +
          `Fecha que se realizara visita ${a.fecha_visita ? fmtFechaHora(a.fecha_visita) : 'Aún no agendada'}. ¡Gracias por confiar en nosotros!`;
      }
      const link = waLink(celular, msj);
      if (!link) return alert('Este registro no tiene número de celular registrado.');
      window.open(link, '_blank');
    });
  }

  metricas();
  renderTabla();
}
