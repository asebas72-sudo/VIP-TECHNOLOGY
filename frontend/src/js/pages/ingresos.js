import { obtenerMarcas, obtenerTiposEquipo } from '../data/catalogos.js';
import { buscarClientePorCedula } from '../data/clientes.js';
import { crearIngreso } from '../data/tickets.js';

const inputCls =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none';
const labelCls = 'mb-1 block text-xs font-bold uppercase text-slate-500';

export async function render(container, { navigate }) {
  container.innerHTML = `
    <button class="mb-4 text-sm font-semibold text-accent" data-back>← Menú</button>
    <h2 class="mb-4 text-xl font-bold text-slate-900">Registrar ingreso de equipo</h2>

    <div id="ingreso-alert" class="mb-4 hidden rounded-md bg-red-50 p-3 text-sm text-red-700"></div>

    <form id="ingreso-form" class="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
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
        <label class="${labelCls}" for="f-equipo">Equipo</label>
        <input id="f-equipo" type="text" class="${inputCls}" placeholder="Ej: HP Pavilion 14" />
      </div>

      <div>
        <label class="${labelCls}" for="f-tipo">Tipo de equipo</label>
        <select id="f-tipo" class="${inputCls}"><option value="">Cargando…</option></select>
      </div>
      <div>
        <label class="${labelCls}" for="f-marca">Marca</label>
        <select id="f-marca" class="${inputCls}"><option value="">Cargando…</option></select>
      </div>

      <div class="md:col-span-2">
        <span class="${labelCls}">Accesorios que entrega el cliente</span>
        <div class="flex flex-wrap gap-3">
          ${['Cargador', 'Teclado', 'Mouse', 'Estuche']
            .map(
              (a) => `
            <label class="flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1 text-xs">
              <input type="checkbox" class="accesorio" value="${a}"> ${a}
            </label>`
            )
            .join('')}
        </div>
      </div>

      <div class="md:col-span-2">
        <label class="${labelCls}" for="f-fallas">Fallas reportadas</label>
        <textarea id="f-fallas" class="${inputCls}" rows="2" placeholder="¿Qué problema presenta el equipo?"></textarea>
      </div>
      <div class="md:col-span-2">
        <label class="${labelCls}" for="f-observaciones">Observaciones</label>
        <textarea id="f-observaciones" class="${inputCls}" rows="2" placeholder="Estado físico, detalles adicionales…"></textarea>
      </div>

      <div class="md:col-span-2">
        <span class="${labelCls}">Foto del equipo</span>
        <input id="f-foto" type="file" accept="image/*" capture="environment" class="text-sm" />
        <img id="foto-preview" class="mt-2 hidden h-32 rounded-md border border-slate-200 object-cover" />
      </div>

      <div class="md:col-span-2">
        <span class="${labelCls}">Firma del cliente</span>
        <canvas id="firma-canvas" class="h-40 w-full rounded-md border border-slate-300 bg-white"></canvas>
        <button type="button" id="btn-limpiar-firma" class="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600">
          Borrar firma
        </button>
      </div>

      <button type="submit" id="btn-guardar" class="md:col-span-2 rounded-md bg-accent py-2.5 text-sm font-bold text-white transition hover:bg-accent-dark">
        Guardar ingreso
      </button>
    </form>

    <div id="confirmacion" class="hidden"></div>
  `;

  container.querySelector('[data-back]').addEventListener('click', () => navigate('menu'));

  // ---------- Catálogos ----------
  const selTipo = container.querySelector('#f-tipo');
  const selMarca = container.querySelector('#f-marca');
  try {
    const [tipos, marcas] = await Promise.all([obtenerTiposEquipo(), obtenerMarcas()]);
    selTipo.innerHTML =
      '<option value="">Selecciona…</option>' +
      tipos.map((t) => `<option value="${t.id}">${t.nombre}</option>`).join('');
    selMarca.innerHTML =
      '<option value="">Selecciona…</option>' +
      marcas.map((m) => `<option value="${m.id}">${m.nombre}</option>`).join('');
  } catch (err) {
    selTipo.innerHTML = '<option value="">Error al cargar</option>';
    selMarca.innerHTML = '<option value="">Error al cargar</option>';
    console.error(err);
  }

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

  // ---------- Firma (canvas) ----------
  const canvas = container.querySelector('#firma-canvas');
  const ctx = canvas.getContext('2d');
  let dibujando = false;
  let hayFirma = false;

  function prepararCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#16202b';
  }
  prepararCanvas();

  function posicion(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const y = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return { x: x - rect.left, y: y - rect.top };
  }
  function iniciar(evt) {
    dibujando = true;
    hayFirma = true;
    const p = posicion(evt);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    evt.preventDefault();
  }
  function continuar(evt) {
    if (!dibujando) return;
    const p = posicion(evt);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    evt.preventDefault();
  }
  function terminar() {
    dibujando = false;
  }
  canvas.addEventListener('mousedown', iniciar);
  canvas.addEventListener('mousemove', continuar);
  canvas.addEventListener('mouseup', terminar);
  canvas.addEventListener('mouseleave', terminar);
  canvas.addEventListener('touchstart', iniciar, { passive: false });
  canvas.addEventListener('touchmove', continuar, { passive: false });
  canvas.addEventListener('touchend', terminar);

  container.querySelector('#btn-limpiar-firma').addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    hayFirma = false;
  });

  // ---------- Envío ----------
  const alertBox = container.querySelector('#ingreso-alert');
  function mostrarErrores(lista) {
    alertBox.innerHTML = `<strong>Revisa lo siguiente:</strong><ul class="ml-4 list-disc">${lista
      .map((e) => `<li>${e}</li>`)
      .join('')}</ul>`;
    alertBox.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  container.querySelector('#ingreso-form').addEventListener('submit', async (evt) => {
    evt.preventDefault();
    alertBox.classList.add('hidden');

    const form = {
      nombre: container.querySelector('#f-nombre').value.trim(),
      cedula: cedulaInput.value.replace(/\D/g, ''),
      celular: container.querySelector('#f-celular').value.replace(/\D/g, ''),
      emailUser: container.querySelector('#f-correo').value.trim(),
      equipo: container.querySelector('#f-equipo').value.trim(),
      tipoEquipoId: container.querySelector('#f-tipo').value || null,
      marcaId: container.querySelector('#f-marca').value || null,
      accesorios: [...container.querySelectorAll('.accesorio:checked')].map((c) => c.value),
      fallas: container.querySelector('#f-fallas').value.trim(),
      observaciones: container.querySelector('#f-observaciones').value.trim(),
      firmaDataUrl: hayFirma ? canvas.toDataURL('image/png') : '',
      fotoDataUrl
    };

    const errores = [];
    if (!form.nombre) errores.push('El nombre es obligatorio.');
    if (!form.cedula) errores.push('La cédula debe contener solo números.');
    if (!form.celular) errores.push('El celular debe contener solo números.');
    if (!form.equipo) errores.push('Describe el equipo.');
    if (!form.tipoEquipoId) errores.push('Selecciona el tipo de equipo.');
    if (!form.marcaId) errores.push('Selecciona la marca.');
    if (!hayFirma) errores.push('Falta la firma del cliente.');
    if (errores.length) return mostrarErrores(errores);

    const btn = container.querySelector('#btn-guardar');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    try {
      const res = await crearIngreso(form);
      renderConfirmacion(container, res, navigate);
    } catch (err) {
      console.error(err);
      mostrarErrores([err.message || 'Error inesperado al guardar.']);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar ingreso';
    }
  });
}

function waLink(celular, texto) {
  let digits = String(celular || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) digits = '57' + digits;
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(texto);
}

function renderConfirmacion(container, res, navigate) {
  container.querySelector('#ingreso-form').classList.add('hidden');
  const mensaje =
    `Hola ${res.nombre} 👋\n` +
    `Tu equipo *${res.equipo}* fue registrado en *VIP TECHNOLOGY*.\n\n` +
    `🧾 Código de Caso: *${res.codigo}*\n` +
    `📅 Fecha de ingreso: ${res.fechaIngreso}\n\n` +
    `Pronto uno de nuestros técnicos se comunicará contigo.\n\n` +
    `Guarda este código, lo necesitarás para reclamar tu equipo.\n` +
    `¡Gracias por confiar en nosotros!`;

  const confirmacion = container.querySelector('#confirmacion');
  confirmacion.classList.remove('hidden');
  confirmacion.innerHTML = `
    <div class="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <div class="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">✓</div>
      <h3 class="text-lg font-bold text-slate-900">Equipo registrado</h3>
      <p class="mb-3 text-sm text-slate-500">Entrega este código al cliente, lo necesitará para reclamar el equipo.</p>
      <div class="mx-auto mb-3 max-w-xs rounded-md bg-accent-soft py-2 font-mono text-base font-bold text-accent-dark">${res.codigo}</div>
      <div class="mx-auto mb-1 flex max-w-xs justify-between text-sm"><span class="text-slate-500">Cliente</span><span>${res.nombre}</span></div>
      <div class="mx-auto mb-1 flex max-w-xs justify-between text-sm"><span class="text-slate-500">Equipo</span><span>${res.equipo}</span></div>
      <div class="mx-auto mb-1 flex max-w-xs justify-between text-sm"><span class="text-slate-500">Entrega estimada</span><span>${res.fechaEntrega}</span></div>

      <label class="${labelCls} mt-4 block text-left">Mensaje para el cliente (editable)</label>
      <textarea id="mensaje-wa" class="${inputCls} min-h-[120px] text-left">${mensaje}</textarea>

      <div class="mt-4 flex flex-col gap-2">
        <button id="btn-wa" class="rounded-md bg-[#25D366] py-2.5 text-sm font-bold text-white">📲 Enviar por WhatsApp</button>
        <button id="btn-otro" class="rounded-md bg-accent py-2.5 text-sm font-bold text-white">Registrar otro equipo</button>
        <button id="btn-menu" class="rounded-md border border-slate-300 py-2.5 text-sm font-bold text-slate-600">Volver al menú</button>
      </div>
    </div>
  `;

  confirmacion.querySelector('#btn-wa').addEventListener('click', () => {
    const texto = confirmacion.querySelector('#mensaje-wa').value.trim();
    const link = waLink(res.celular, texto);
    if (!link) return alert('No hay un celular válido para enviar el WhatsApp.');
    window.open(link, '_blank');
  });
  confirmacion.querySelector('#btn-otro').addEventListener('click', () => navigate('ingresos'));
  confirmacion.querySelector('#btn-menu').addEventListener('click', () => navigate('menu'));
}
