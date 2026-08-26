const PAGINAS = {
  menu: () => import('./pages/menu.js'),
  ingresos: () => import('./pages/ingresos.js'),
  ingresoForm: () => import('./pages/ingreso-form.js'),
  reparaciones: () => import('./pages/reparaciones.js'),
  asesorias: () => import('./pages/asesorias.js'),
  asesoriaForm: () => import('./pages/asesoria-form.js')
};

export async function navigate(page, container) {
  const cargador = PAGINAS[page] || PAGINAS.menu;
  const modulo = await cargador();
  await modulo.render(container, {
    navigate: (p) => navigate(p, container)
  });
}
