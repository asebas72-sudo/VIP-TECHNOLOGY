export function render(container, { navigate }) {
  container.innerHTML = `
    <section class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900">¿Qué necesitas hacer?</h1>
      <p class="text-sm text-slate-500">Elige una opción para continuar.</p>
    </section>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      ${tarjeta('ingresos', '🖥️', 'Ingresos', 'Registrar un equipo que entra a reparación.')}
      ${tarjeta('reparaciones', '🔧', 'Reparaciones', 'Diagnóstico y seguimiento de los equipos.')}
      ${tarjeta('asesorias', '🗓️', 'Asesorías', 'Agendar y hacer seguimiento a visitas de asesoría.')}
    </div>
  `;

  container.querySelectorAll('[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });
}

function tarjeta(page, icono, titulo, desc) {
  return `
    <button data-page="${page}"
            class="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span class="text-3xl">${icono}</span>
      <span class="mt-3 block text-base font-bold text-slate-900">${titulo}</span>
      <span class="mt-1 block text-sm text-slate-500">${desc}</span>
    </button>
  `;
}
