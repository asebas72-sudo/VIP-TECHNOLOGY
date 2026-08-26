const PAGINAS = {
  menu: () => import('./pages/menu.js'),
  ingresos: () => import('./pages/ingresos.js'),
  // Se activan uno a uno en los próximos pasos de la migración:
  reparaciones: () => import('./pages/proximamente.js'),
  asesorias: () => import('./pages/proximamente.js')
};

const TITULOS = {
  ingresos: 'Ingresos',
  reparaciones: 'Reparaciones',
  asesorias: 'Asesorías'
};

export async function navigate(page, container) {
  const cargador = PAGINAS[page] || PAGINAS.menu;
  const modulo = await cargador();
  await modulo.render(container, {
    navigate: (p) => navigate(p, container),
    titulo: TITULOS[page] || ''
  });
}
