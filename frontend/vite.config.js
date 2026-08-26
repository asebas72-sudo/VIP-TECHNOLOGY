import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages sirve el sitio en /<repo>/ en vez de la raíz del dominio.
// Cambia BASE_PATH si el repo se llama distinto a "VIP".
const BASE_PATH = process.env.BASE_PATH || '/VIP/';

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'VIP TECHNOLOGY',
        short_name: 'VIP Tech',
        description: 'Gestión de ingresos, reparaciones y asesorías — VIP TECHNOLOGY',
        theme_color: '#7e22ce',
        background_color: '#f1f5f9',
        display: 'standalone',
        start_url: BASE_PATH,
        scope: BASE_PATH,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Cachea el shell de la app; las llamadas a Supabase van siempre a red.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      }
    })
  ],
  build: {
    outDir: 'dist'
  }
});
