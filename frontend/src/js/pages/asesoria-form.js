import { buscarClientePorCedula } from '../data/clientes.js';
import { crearAsesoria } from '../data/asesorias.js';
import { waLink } from '../../lib/whatsapp.js';

const inputCls =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none';
const labelCls = 'mb-1 block text-xs font-bold uppercase text-slate-500';

const SOLICITUDES = [
  'Instalación de software',
  'Configuración de red',
  'Mantenimiento CCTV',
  'Instalacion CCTV',
  'Revision Camaras',
  'Visita Tecnica',
  'Otro'
];

export async function render(container, { navigate }) {
  container.innerHTML = `
    <button class="mb-4 text-sm font-semibold text-accent" data-back>← Asesorías</button>
    <h2 class="mb-4 text-xl font-bold text-slate-900">Registrar solicitud de asesoría</h2>

    <div id="ase-alert" class="mb-4 hidden rounded-md bg-red-50 p-3 text-sm text-red-700"></div>

    <form id="ase-form" class="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
      <div class="md:col-span-2">
        <label class="${labelCls}" for="f-cedula">Cédula</label>
        <input id="f-cedula" type="text" inputmode="numeric" class="${inputCls}" placeholder="Escribe la cédula para buscar cliente…" />
        <span id="cedula-hint" class="mt-1 hidden text-xs text-slate-500"></span>
      </div>

      <div class="md:col-span-2">
        <label class="${labelCls}" for="f-nombre">Nombre del cliente</label>
        <input id="f-nombre" type="text" class="${inputCls}" placeholder="Ej: Laura Gómez" />
      </div>

      <div>
        <label class="${labelCls}" for="f-celular">Celular</label>
        <input id="f-celular" type="tel" inputmode="numeric" class="${inputCls}" placeholder="Solo números" />
      </div>
      <div>
        <label class="${labelCls}" for="f-correo">Correo del cliente</label>
        <input id="f-correo" type="email" class="${inputCls}" placeholder="correo@ejemplo.com" />
      </div>

      <div class="md:col-span-2">
        <label class="${labelCls}" for="f-solicitud">Tipo de asesoría</label>
        <select id="f-solicitud" class="${inputCls}">
          <option value="">Selecciona…</option>
          ${SOLICITUDES.map((s) => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>

      <div class="md:col-span-2">
        <label class="${labelCls}" for="f-fallas">Detalle de la solicitud / novedad</label>
        <textarea id="f-fallas" class="${inputCls}" rows="2" placeholder="¿Qué necesita el cliente?"></textarea>
      </div>
      <div class="md:col-span-2">
        <label class="${labelCls}" for="f-observaciones">Observaciones</label>
        <textarea id="f-observaciones" class="${inputCls}" rows="2" placeholder="Detalles adicionales…"></textarea>
      </div>

      <div class="md:col-span-2">
        <span class="${labelCls}">Foto de referencia (opcional)</span>
        <input id="f-foto" type="file" accept="image/*" capture="environment" class="text-sm" />
        <img id="foto-preview" class="mt-2 hidden h-32 rounded-md border border-slate-200 object-cover" />
      </div>

      <button type="submit" id="btn-guardar" class="md:col-span-2 rounded-md bg-accent py-2.5 text-sm font-bold text-white transition hover:bg-accent-dark">
        Guardar solicitud
      </button>
    </form>

    <div id="confirmacion" class="hidden"></div>
  `;

  container.querySelector('[data-back]').addEventListener('click', () => navigate('asesorias'));

  // ---------- Autocompletado por cédula ----------
  const cedulaInput = container.querySelector('#f-cedula');
  const cedulaHint = container.querySelector('#cedula-hint');
  cedulaInput.addEventListener('blur', async () => {
    const cedula = cedulaInput.value.replace(/\D/g, '');
    if (cedula.length < 4) return;
    cedulaHint.textContent = '🔍 Buscando cliente…';
    cedulaHint.classList.remove('hidden');
    try {
      const cliente = await buscarClientePorCedula(cedula);
      if (cliente) {
        const nombreEl = container.querySelector('#f-nombre');
        const celEl = container.querySelector('#f-celular');
        const correoEl = container.querySelector('#f-correo');
        if (!nombreEl.value.trim()) nombreEl.value = cliente.nombre || '';
        if (!celEl.value.trim()) celEl.value = cliente.celular || '';
        if (!correoEl.value.trim()) correoEl.value = cliente.correo || '';
        cedulaHint.textContent = `✅ Cliente encontrado: ${cliente.nombre || ''}`;
      } else {
        cedulaHint.classList.add('hidden');
      }
    } catch (err) {
      console.error(err);
      cedulaHint.classList.add('hidden');
    }
  });

  // ---------- Foto ----------
  let fotoDataUrl = '';
  container.querySelector('#f-foto').addEventListener('change', (evt) => {
    const file = evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      fotoDataUrl = e.target.result;
      const img = container.querySelector('#foto-preview');
      img.src = fotoDataUrl;
      img.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  });

  // ---------- Envío ----------
  const alertBox = container.querySelector('#ase-alert');
  function mostrarErrores(lista) {
    alertBox.innerHTML = `<strong>Revisa lo siguiente:</strong><ul class="ml-4 list-disc">${lista
      .map((e) => `<li>${e}</li>`)
      .join('')}</ul>`;
    alertBox.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  container.querySelector('#ase-form').addEventListener('submit', async (evt) => {
    evt.preventDefault();
    alertBox.classList.add('hidden');

    const form = {
      nombre: container.querySelector('#f-nombre').value.trim(),
      cedula: cedulaInput.value.replace(/\D/g, ''),
      celular: container.querySelector('#f-celular').value.replace(/\D/g, ''),
      emailUser: container.querySelector('#f-correo').value.trim(),
      solicitud: container.querySelector('#f-solicitud').value,
      fallas: container.querySelector('#f-fallas').value.trim(),
      observaciones: container.querySelector('#f-observaciones').value.trim(),
      fotoDataUrl
    };

    const errores = [];
    if (!form.nombre) errores.push('El nombre es obligatorio.');
    if (!form.cedula) errores.push('La cédula debe contener solo números.');
    if (!form.celular) errores.push('El celular debe contener solo números.');
    if (!form.solicitud) errores.push('Selecciona el tipo de asesoría.');
    if (errores.length) return mostrarErrores(errores);

    const btn = container.querySelector('#btn-guardar');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    try {
      const res = await crearAsesoria(form);
      renderConfirmacion(container, res, navigate);
    } catch (err) {
      console.error(err);
      mostrarErrores([err.message || 'Error inesperado al guardar.']);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar solicitud';
    }
  });
}

function renderConfirmacion(container, res, navigate) {
  container.querySelector('#ase-form').classList.add('hidden');
  const mensaje =
    `Hola ${res.nombre} 👋\n` +
    `Tu solicitud de asesoría *${res.solicitud}* fue registrada en *VIP TECHNOLOGY*.\n\n` +
    `🧾 ID de solicitud: *${res.idAsesoria}*\n` +
    `📅 Fecha de solicitud: ${res.fechaIngreso}\n\n` +
    `Pronto confirmaremos contigo los detalles.\n` +
    `¡Gracias por confiar en nosotros!`;

  const confirmacion = container.querySelector('#confirmacion');
  confirmacion.classList.remove('hidden');
  confirmacion.innerHTML = `
    <div class="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <div class="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">✓</div>
      <h3 class="text-lg font-bold text-slate-900">Asesoría registrada</h3>
      <p class="mb-3 text-sm text-slate-500">Guarda este ID para dar seguimiento a la solicitud.</p>
      <div class="mx-auto mb-3 max-w-xs rounded-md bg-accent-soft py-2 font-mono text-base font-bold text-accent-dark">#${res.idAsesoria}</div>
      <div class="mx-auto mb-1 flex max-w-xs justify-between text-sm"><span class="text-slate-500">Cliente</span><span>${res.nombre}</span></div>
      <div class="mx-auto mb-1 flex max-w-xs justify-between text-sm"><span class="text-slate-500">Solicitud</span><span>${res.solicitud}</span></div>
      <div class="mx-auto mb-1 flex max-w-xs justify-between text-sm"><span class="text-slate-500">Fecha de solicitud</span><span>${res.fechaIngreso}</span></div>

      <label class="${labelCls} mt-4 block text-left">Mensaje para el cliente (editable)</label>
      <textarea id="mensaje-wa" class="${inputCls} min-h-[120px] text-left">${mensaje}</textarea>

      <div class="mt-4 flex flex-col gap-2">
        <button id="btn-wa" class="rounded-md bg-[#25D366] py-2.5 text-sm font-bold text-white">📲 Enviar por WhatsApp</button>
        <button id="btn-otro" class="rounded-md bg-accent py-2.5 text-sm font-bold text-white">Registrar otra asesoría</button>
        <button id="btn-listado" class="rounded-md border border-slate-300 py-2.5 text-sm font-bold text-slate-600">Volver al listado</button>
      </div>
    </div>
  `;

  confirmacion.querySelector('#btn-wa').addEventListener('click', () => {
    const texto = confirmacion.querySelector('#mensaje-wa').value.trim();
    const link = waLink(res.celular, texto);
    if (!link) return alert('No hay un celular válido para enviar el WhatsApp.');
    window.open(link, '_blank');
  });
  confirmacion.querySelector('#btn-otro').addEventListener('click', () => navigate('asesoriaForm'));
  confirmacion.querySelector('#btn-listado').addEventListener('click', () => navigate('asesorias'));
}
