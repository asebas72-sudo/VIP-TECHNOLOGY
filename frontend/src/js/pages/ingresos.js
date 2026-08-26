import { listarTickets, marcarTicketEntregado } from '../data/tickets.js';
import { waIconCell, waLink } from '../../lib/whatsapp.js';

const COLOR_ESTADO = {
  INGRESADO: 'bg-sky-100 text-sky-700',
  'EN PROCESO': 'bg-amber-100 text-amber-700',
  'ESPERA REPUESTOS': 'bg-orange-100 text-orange-700',
  REVISADO: 'bg-purple-100 text-purple-700',
  LISTO: 'bg-green-100 text-green-700',
  ENTREGADO: 'bg-indigo-100 text-indigo-700'
};

function badge(estado) {
  const cls = COLOR_ESTADO[estado] || 'bg-slate-100 text-slate-600';
  return `<span class="rounded px-2 py-0.5 text-[11px] font-bold uppercase ${cls}">${estado || '—'}</span>`;
}

function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtCosto(v) {
  if (!v && v !== 0) return '—';
  return '$ ' + Number(v).toLocaleString('es-CO');
}

const ESTADOS_FILTRO = [
  ['TODOS', '📋 Todos los estados'],
  ['INGRESADO', '📥 Ingresado'],
  ['PROCESO', '🔧 En soporte'],
  ['LISTO', '✅ Listo'],
  ['ENTREGADO', '📦 Entregado']
];

export async function render(container, { navigate }) {
  container.innerHTML = `
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <button class="mb-1 block text-sm font-semibold text-accent" data-back>← Menú</button>
        <h2 class="text-xl font-bold text-slate-900">Control de Ingresos</h2>
      </div>
      <button id="btn-nuevo" class="rounded-md bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-dark">+ Registrar equipo</button>
    </div>

    <div id="ing-metricas" class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5"></div>

    <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <input id="ing-busqueda" type="text" placeholder="Buscar por cliente, ticket…"
             class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm sm:min-w-[220px]" />
      <select id="ing-filtro-estado" class="rounded-md border border-slate-300 px-3 py-2 text-sm">
        ${ESTADOS_FILTRO.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
      <div class="flex items-center gap-2 text-xs text-slate-500">
        <span>Desde</span>
        <input id="ing-desde" type="date" class="rounded-md border border-slate-300 px-2 py-2 text-sm" />
        <span>Hasta</span>
        <input id="ing-hasta" type="date" class="rounded-md border border-slate-300 px-2 py-2 text-sm" />
      </div>
    </div>

    <div id="ing-alert" class="mb-3 hidden rounded-md bg-red-50 p-3 text-sm text-red-700"></div>

    <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table class="w-full min-w-[820px] text-left text-sm">
        <thead class="bg-slate-50 text-xs font-bold uppercase text-slate-500">
          <tr>
            <th class="px-2 py-2 text-center">WA</th>
            <th class="cursor-pointer px-3 py-2" data-sort="fecha_ingreso">Fecha ↑↓</th>
            <th class="px-3 py-2">Código</th>
            <th class="cursor-pointer px-3 py-2" data-sort="cliente">Cliente ↑↓</th>
            <th class="px-3 py-2">Celular</th>
            <th class="px-3 py-2">Equipo</th>
            <th class="px-3 py-2">Técnico</th>
            <th class="px-3 py-2">Falla</th>
            <th class="px-3 py-2">Costo</th>
            <th class="px-3 py-2">Obs. final</th>
            <th class="cursor-pointer px-3 py-2" data-sort="estado">Estado ↑↓</th>
          </tr>
        </thead>
        <tbody id="ing-tbody"></tbody>
      </table>
      <div class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <span id="ing-pag-info"></span>
        <div class="flex gap-2">
          <button id="ing-prev" class="rounded border border-slate-300 px-2 py-1">← Ant</button>
          <button id="ing-next" class="rounded border border-slate-300 px-2 py-1">Sig →</button>
        </div>
      </div>
    </div>

    <div id="ing-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-900/70 p-4">
      <div id="ing-modal-card" class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"></div>
    </div>
  `;

  container.querySelector('[data-back]').addEventListener('click', () => navigate('menu'));
  container.querySelector('#btn-nuevo').addEventListener('click', () => navigate('ingresoForm'));

  let todos = [];
  let sortCol = 'fecha_ingreso';
  let sortAsc = false;
  let pagina = 1;
  const porPagina = 12;
  const alertBox = container.querySelector('#ing-alert');

  try {
    todos = await listarTickets();
  } catch (err) {
    console.error(err);
    alertBox.textContent = 'No se pudieron cargar los ingresos: ' + err.message;
    alertBox.classList.remove('hidden');
    return;
  }

  function metricas() {
    const cont = (pred) => todos.filter(pred).length;
    const tarjetas = [
      ['Total', todos.length, 'border-slate-400'],
      ['Ingresados', cont((t) => t.estado === 'INGRESADO'), 'border-sky-400'],
      ['En soporte', cont((t) => t.estado === 'EN PROCESO' || t.estado === 'REVISADO'), 'border-amber-400'],
      ['Listos', cont((t) => t.estado === 'LISTO'), 'border-green-400'],
      ['Entregados', cont((t) => t.estado === 'ENTREGADO'), 'border-indigo-400']
    ];
    container.querySelector('#ing-metricas').innerHTML = tarjetas
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
    const q = container.querySelector('#ing-busqueda').value.toLowerCase().trim();
    const estadoFiltro = container.querySelector('#ing-filtro-estado').value;
    const desde = container.querySelector('#ing-desde').value;
    const hasta = container.querySelector('#ing-hasta').value;

    let filas = todos.filter((t) => {
      const texto = `${t.codigo} ${t.cliente?.nombre || ''} ${t.equipo}`.toLowerCase();
      const cumpleBusqueda = !q || texto.includes(q);

      let cumpleEstado = true;
      if (estadoFiltro !== 'TODOS') {
        cumpleEstado =
          estadoFiltro === 'PROCESO' ? t.estado === 'EN PROCESO' || t.estado === 'REVISADO' : t.estado === estadoFiltro;
      }

      let cumpleFecha = true;
      if (desde || hasta) {
        const f = t.fecha_ingreso ? new Date(t.fecha_ingreso) : null;
        if (!f) cumpleFecha = false;
        else {
          if (desde && f < new Date(desde + 'T00:00:00')) cumpleFecha = false;
          if (hasta && f > new Date(hasta + 'T23:59:59')) cumpleFecha = false;
        }
      }
      return cumpleBusqueda && cumpleEstado && cumpleFecha;
    });

    filas.sort((a, b) => {
      // Los INGRESADO recientes primero, igual que en legacy.
      const aIng = a.estado === 'INGRESADO' ? 0 : 1;
      const bIng = b.estado === 'INGRESADO' ? 0 : 1;
      if (aIng !== bIng) return aIng - bIng;

      let va, vb;
      if (sortCol === 'cliente') {
        va = a.cliente?.nombre || '';
        vb = b.cliente?.nombre || '';
      } else if (sortCol === 'estado') {
        va = a.estado || '';
        vb = b.estado || '';
      } else {
        va = a.fecha_ingreso || '';
        vb = b.fecha_ingreso || '';
      }
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });

    return filas;
  }

  function renderTabla() {
    const filas = filtrarOrdenar();
    const total = filas.length;
    const inicio = (pagina - 1) * porPagina;
    const fin = Math.min(inicio + porPagina, total);
    const slice = filas.slice(inicio, fin);

    container.querySelector('#ing-pag-info').textContent =
      total === 0 ? 'Sin registros' : `Registros ${inicio + 1} al ${fin} de ${total}`;
    container.querySelector('#ing-prev').disabled = pagina <= 1;
    container.querySelector('#ing-next').disabled = fin >= total;

    const tbody = container.querySelector('#ing-tbody');
    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="11" class="px-3 py-8 text-center text-slate-400">Ningún ticket bajo este criterio.</td></tr>`;
      return;
    }

    tbody.innerHTML = slice
      .map((t) => {
        const obs = t.observacion_final || '—';
        const obsTrunc = obs.length > 36 ? obs.slice(0, 36) + '…' : obs;
        return `
      <tr class="cursor-pointer border-t border-slate-100 hover:bg-slate-50" data-id="${t.id}">
        <td class="px-2 py-2 text-center">${waIconCell(t.cliente?.celular || t.celular)}</td>
        <td class="px-3 py-2 text-xs text-slate-500">${fmtFecha(t.fecha_ingreso)}</td>
        <td class="px-3 py-2 font-mono text-xs">${t.codigo}</td>
        <td class="px-3 py-2 font-semibold">${t.cliente?.nombre || '—'}</td>
        <td class="px-3 py-2">${t.cliente?.celular || t.celular || '—'}</td>
        <td class="px-3 py-2">${t.equipo}</td>
        <td class="px-3 py-2">${t.tecnico?.nombre || '<span class="italic text-slate-400">Sin asignar</span>'}</td>
        <td class="max-w-[160px] truncate px-3 py-2 text-xs">${t.fallas || '—'}</td>
        <td class="px-3 py-2 font-mono text-xs font-semibold text-green-700">${fmtCosto(t.costo)}</td>
        <td class="px-3 py-2 text-xs text-slate-500">${obsTrunc}</td>
        <td class="px-3 py-2">${badge(t.estado)}</td>
      </tr>`;
      })
      .join('');

    tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.addEventListener('click', () => abrirModal(Number(tr.dataset.id)));
    });
  }

  container.querySelector('#ing-busqueda').addEventListener('input', () => {
    pagina = 1;
    renderTabla();
  });
  container.querySelector('#ing-filtro-estado').addEventListener('change', () => {
    pagina = 1;
    renderTabla();
  });
  container.querySelector('#ing-desde').addEventListener('change', renderTabla);
  container.querySelector('#ing-hasta').addEventListener('change', renderTabla);
  container.querySelector('#ing-prev').addEventListener('click', () => {
    pagina -= 1;
    renderTabla();
  });
  container.querySelector('#ing-next').addEventListener('click', () => {
    pagina += 1;
    renderTabla();
  });
  container.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      sortAsc = sortCol === col ? !sortAsc : true;
      sortCol = col;
      renderTabla();
    });
  });

  // ---------------------------------------------------------------- modal --
  const modal = container.querySelector('#ing-modal');
  const modalCard = container.querySelector('#ing-modal-card');

  function cerrarModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function abrirModal(id) {
    const t = todos.find((x) => x.id === id);
    if (!t) return;
    const yaEntregado = t.estado === 'ENTREGADO';

    modalCard.innerHTML = `
      <div class="mb-3 flex items-start justify-between">
        <span class="font-mono text-xs text-slate-400">Ticket: ${t.codigo}</span>
        <button data-close class="text-slate-400 hover:text-slate-700">✕</button>
      </div>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div><span class="block text-[10px] font-bold uppercase text-slate-400">Fecha registro</span>${fmtFecha(t.fecha_ingreso)}</div>
        <div><span class="block text-[10px] font-bold uppercase text-slate-400">Estado</span>${badge(t.estado)}</div>
        <div class="col-span-2"><span class="block text-[10px] font-bold uppercase text-slate-400">Cliente</span><b>${t.cliente?.nombre || '—'}</b></div>
        <div><span class="block text-[10px] font-bold uppercase text-slate-400">Celular</span>${t.cliente?.celular || t.celular || '—'}</div>
        <div><span class="block text-[10px] font-bold uppercase text-slate-400">Marca</span>${t.marca?.nombre || '—'}</div>
        <div class="col-span-2"><span class="block text-[10px] font-bold uppercase text-slate-400">Equipo</span>${t.equipo}</div>
        <div class="col-span-2"><span class="block text-[10px] font-bold uppercase text-slate-400">Falla reportada</span>${t.fallas || 'Sin fallas reportadas.'}</div>
        <div><span class="block text-[10px] font-bold uppercase text-slate-400">💰 Costo</span><b class="text-green-700">${fmtCosto(t.costo)}</b></div>
        <div><span class="block text-[10px] font-bold uppercase text-slate-400">Estado actual</span>${badge(t.estado)}</div>
        <div class="col-span-2"><span class="block text-[10px] font-bold uppercase text-slate-400">📝 Observación final</span>${t.observacion_final || 'Sin observación registrada.'}</div>
      </div>

      <div class="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4">
        <button id="btn-entregar" class="rounded-md bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500">
          ${yaEntregado ? '✅ Ya fue marcado como ENTREGADO' : '📦 Marcar como ENTREGADO y guardar'}
        </button>
        <button id="btn-wa-entrega" class="rounded-md bg-[#25D366] py-2.5 text-sm font-bold text-white hover:opacity-90">
          💬 Notificar entrega por WhatsApp
        </button>
        <p id="ing-entregado-msg" class="hidden text-center text-xs font-semibold text-green-700">✅ Equipo marcado como ENTREGADO correctamente.</p>
      </div>
    `;
    modalCard.querySelector('#btn-entregar').disabled = yaEntregado;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modalCard.querySelector('[data-close]').addEventListener('click', cerrarModal);

    modalCard.querySelector('#btn-entregar').addEventListener('click', async () => {
      const btn = modalCard.querySelector('#btn-entregar');
      btn.disabled = true;
      btn.textContent = '⏳ Guardando…';
      try {
        await marcarTicketEntregado(t.id);
        t.estado = 'ENTREGADO';
        metricas();
        renderTabla();
        btn.textContent = '✅ Ya fue marcado como ENTREGADO';
        modalCard.querySelector('#ing-entregado-msg').classList.remove('hidden');
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.textContent = '📦 Marcar como ENTREGADO y guardar';
        alert('No se pudo guardar: ' + err.message);
      }
    });

    modalCard.querySelector('#btn-wa-entrega').addEventListener('click', () => {
      const celular = t.cliente?.celular || t.celular;
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
      const msj =
        `Hola ${t.cliente?.nombre || 'Cliente'} 👋, te confirmamos que tu equipo ${t.equipo} ` +
        `(Ticket: ${t.codigo}) fue entregado satisfactoriamente el ${fechaHora}. ¡Gracias por confiar en nosotros!`;
      const link = waLink(celular, msj);
      if (!link) return alert('Este registro no tiene número de celular registrado.');
      window.open(link, '_blank');
    });
  }

  metricas();
  renderTabla();
}
