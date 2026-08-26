// Placeholder temporal: cada módulo real (ingresos, reparaciones, asesorías)
// se construye en el siguiente paso, conectando directo contra Supabase
// (tablas `tickets` / `asesorias` con RLS) en vez de google.script.run.
export function render(container, { navigate, titulo }) {
  container.innerHTML = `
    <button class="mb-4 text-sm font-semibold text-accent" data-back>← Menú</button>
    <div class="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <span class="text-4xl">🚧</span>
      <h2 class="mt-3 text-lg font-bold text-slate-900">${titulo} — en construcción</h2>
      <p class="mt-1 text-sm text-slate-500">Este módulo se conecta en el próximo paso de la migración.</p>
    </div>
  `;
  container.querySelector('[data-back]').addEventListener('click', () => navigate('menu'));
}
